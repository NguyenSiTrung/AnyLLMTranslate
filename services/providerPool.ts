/**
 * ProviderPoolCoordinator — the multi-provider translation service.
 *
 * Implements {@link TranslationService} and sits at the single `initService()`
 * seam in services/background.ts, so every translation path (page, subtitle,
 * PDF, selection, hover, inline, category-detect) is covered without per-path
 * changes (FR-6).
 *
 * Responsibilities:
 *  - Holds one {@link OpenAICompatibleService} per enabled pool slot (own
 *    RateLimiter + own responseFormatDisabled state — correct, since those are
 *    scoped to the provider's baseUrl + key).
 *  - Round-robin distribution across slots via {@link PoolCursor} (FR-3).
 *  - Circuit-breaker failover via {@link CircuitBreaker} (FR-4): on 429/5xx/
 *    network → escalating cooldown + retry next healthy slot; on 401/403 →
 *    long-open + credentialInvalid; on other 4xx → no cooldown (surfaces).
 *  - `rebuild(settings)` live-reconfigures member services in place, preserving
 *    circuit-breaker state for unchanged key identities (FR-6).
 *
 * The default `serviceFactory` constructs an {@link OpenAICompatibleService}
 * from a ProviderConfig; tests inject a stub factory to observe dispatch.
 */

import type {
  ExtensionSettings,
  PoolProvider,
  PageContext,
  ProviderConfig,
} from '@/types/config';
import type {
  TranslationRequest,
  TranslationResult,
} from '@/types/translation';
import type {
  ClassifyPdfParagraphsResult,
  ResegmentYoutubeAsrResult,
} from '@/types/messages';
import type { AsrTimedUnit } from '@/lib/youtubeAsrResegment';
import type { TranslationService } from './base';
import { OpenAICompatibleService, ApiError } from './openaiCompatible';
import { createCircuitBreaker, type CircuitBreaker, type FailureKind } from '@/lib/circuitBreaker';
import { createPoolCursor, type PoolCursor } from '@/lib/poolCursor';
import { resolveSlots, healthySlots, type PoolSlot } from '@/lib/poolResolver';

/** Factory that builds a member service for a slot's resolved config.
 *  Receives the slot identity as a second arg so factories can log/instrument
 *  per-key (the production OpenAICompatibleService factory ignores it). */
export type ServiceFactory = (
  config: ProviderConfig,
  slotIdentity: { keyId: string; providerId: string },
) => TranslationService;

/** Options for constructing a coordinator (mostly for test injection). */
export interface ProviderPoolCoordinatorOptions {
  /** Override the member-service factory (tests inject a stub). */
  serviceFactory?: ServiceFactory;
  /** Override the clock (tests inject a controllable now). */
  clock?: () => number;
  /** Override the delay for per-key throttle sleeps (fake-timer friendly) (FR-5). */
  delay?: (ms: number) => Promise<void>;
}

/** Public view of a single key's status — drives the UI badge. */
export interface KeyStatus {
  /** Stable key id. */
  keyId: string;
  /** Parent provider id. */
  providerId: string;
  /** True while the slot is in cooldown (skipped by rotation). */
  open: boolean;
  /** Absolute wall-clock ms timestamp when the slot auto-rejoins. */
  openUntil: number;
  /** True when the most recent failure was an auth (401/403). */
  credentialInvalid: boolean;
  /** Human-readable failure kind that opened the slot, if any. */
  lastFailureKind?: FailureKind;
  /** True when the key or its provider is disabled. */
  disabled: boolean;
}

/**
 * Error thrown when the pool has no healthy slots to dispatch to. Carries the
 * last failure so callers can surface it through existing error paths.
 *
 * FR-8 #11: `lastError` is ALWAYS a non-null `Error`. On the "all slots open
 * before dispatch" path (no failure was observed this request), it carries a
 * descriptive Error so callers reading `.lastError.message` never throw on
 * null. Callers may safely do `err.lastError.message`.
 *
 * `openUntil` is the earliest wall-clock ms when any cooling slot is expected
 * to rejoin (when known). UI uses this for a retry countdown.
 */
export class PoolExhaustedError extends Error {
  readonly lastError: Error;
  /** Absolute wall-clock ms when the earliest open slot auto-rejoins. */
  readonly openUntil?: number;
  constructor(message: string, lastError: Error, openUntil?: number) {
    super(message);
    this.name = 'PoolExhaustedError';
    this.lastError = lastError;
    if (openUntil !== undefined && openUntil > 0) {
      this.openUntil = openUntil;
    }
  }
}

interface MemberRecord {
  service: TranslationService;
  slot: PoolSlot;
}

export class ProviderPoolCoordinator implements TranslationService {
  private readonly serviceFactory: ServiceFactory;
  private readonly breaker: CircuitBreaker;
  private readonly clock: () => number;
  private readonly cursor: PoolCursor;
  private readonly delay: (ms: number) => Promise<void>;

  /** All currently-enabled slots (the rotation universe). */
  private slots: PoolSlot[] = [];
  /** keyId → member service, kept in sync with `slots`. */
  private members: Map<string, MemberRecord> = new Map();
  /** Tracks which keyIds are disabled (for status reporting). */
  private disabledKeyIds: Set<string> = new Set();
  /** keyId → providerId, for status reporting. */
  private keyToProvider: Map<string, string> = new Map();

  // FR-5: per-key concurrency limit + throttle interval state.
  /** keyId → count of in-flight requests on that key. */
  private readonly inFlight: Map<string, number> = new Map();
  /** keyId → queue of pending per-key-concurrency waiters (FIFO). */
  private readonly keyQueues: Map<string, Array<() => void>> = new Map();
  /** keyId → wall-clock ms of the last dispatched request on that key. */
  private readonly lastDispatchAt: Map<string, number> = new Map();

  constructor(options: ProviderPoolCoordinatorOptions = {}) {
    this.serviceFactory =
      options.serviceFactory ??
      ((config) => new OpenAICompatibleService(config));
    this.clock = options.clock ?? (() => Date.now());
    this.breaker = createCircuitBreaker({ clock: this.clock });
    this.cursor = createPoolCursor(0);
    this.delay = options.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * Live-reconfigure member services from settings. Member instances are
   * PRESERVED for any key whose identity (keyId) is unchanged, so circuit-
   * breaker state and RateLimiter windows survive a rebuild (FR-6). New keys
   * get fresh services; removed keys are dropped.
   */
  rebuild(settings: ExtensionSettings): void {
    const now = this.clock();
    const providers = settings.providers ?? [];

    // Build the full slot list (all enabled-provider × enabled-key pairs) AND
    // track every key (enabled or not) for status reporting.
    const newSlots = resolveSlots(providers);
    this.disabledKeyIds = new Set();
    this.keyToProvider.clear();
    for (const provider of providers) {
      for (const key of provider.keys ?? []) {
        this.keyToProvider.set(key.id, provider.id);
        if (!provider.enabled || !key.enabled) {
          this.disabledKeyIds.add(key.id);
        }
      }
    }

    // Diff against existing members: keep shared keyIds, drop removed, add new.
    const newMemberIds = new Set(newSlots.map((s) => s.keyId));
    for (const keyId of Array.from(this.members.keys())) {
      if (!newMemberIds.has(keyId)) {
        this.members.delete(keyId);
      }
    }
    for (const slot of newSlots) {
      const existing = this.members.get(slot.keyId);
      if (existing) {
        // Preserve the member instance (breaker state + rate limiter window).
        existing.slot = slot;
        // Live-reconfigure the member in place so it dispatches with the new
        // config (baseUrl/model/apiKey/maxRpm). Without this, the member keeps
        // its original config and every translation request goes out stale
        // while a per-key Test (which builds a fresh config from the UI) still
        // succeeds — the bug behind AnyLLMTranslate-bfw.
        existing.service.updateConfig?.(slot.providerConfig);
      } else {
        this.members.set(slot.keyId, {
          service: this.serviceFactory(slot.providerConfig, {
            keyId: slot.keyId,
            providerId: slot.providerId,
          }),
          slot,
        });
      }
    }

    this.slots = newSlots;
    this.cursor.setSlotCount(newSlots.length);
    // Touch the breaker so `now` is current (no-op, but documents intent).
    void now;
  }

  /**
   * Pick the next healthy slot via the cursor, dispatch, and fail over on
   * eligible failures (FR-3 + FR-4). Bounded by the healthy-slot count so it
   * never loops infinitely; if every slot fails, throws the last error.
   */
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    return this.dispatchWithFailover((service) => service.translate(request));
  }

  /**
   * Streaming translation (Phase 2, PDF-only opt-in). Delegates to member
   * services that implement `translateStream`, with the same failover semantics
   * as translate() — on a transport/auth/rate-limit error, the next healthy
   * slot is tried. The `onPiece` callback is invoked per completed paragraph
   * as the SSE stream arrives.
   *
   * If NO member supports streaming (all lack translateStream), falls back to
   * non-streaming translate() so the caller still gets a result.
   */
  async translateStream(
    request: TranslationRequest,
    onPiece: (id: string, text: string) => void,
  ): Promise<TranslationResult> {
    return this.dispatchWithFailover((service) => {
      if (service.translateStream) {
        return service.translateStream(request, onPiece);
      }
      // Member doesn't support streaming — fall back to non-streaming and
      // emit all pieces at once via the callback (best-effort incremental UX).
      return service.translate(request).then((result) => {
        if (result.success) {
          for (const [id, text] of result.translations) {
            onPiece(id, text);
          }
        }
        return result;
      });
    });
  }

  async testConnection(
    opts?: { keyId?: string },
  ): Promise<{ success: boolean; error?: string }> {
    if (opts?.keyId) {
      return this.testSpecificKey(opts.keyId);
    }
    // FR-8 #12: a keyId-less testConnection routes through dispatchWithFailover,
    // which filters to healthySlots — so an open (cooling) slot is automatically
    // skipped and a healthy slot is tested instead. This is the preferred
    // behavior: "Test all" should never block on a rate-limited key.
    try {
      await this.dispatchWithFailover((service) => service.testConnection());
      return { success: true };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  }

  async detectPageCategory(
    pageContext: PageContext,
  ): Promise<{ success: boolean; category?: string; error?: string }> {
    try {
      // The member service returns {success, category, error}; we propagate it.
      // Failover only triggers on a thrown error, not on success:false.
      const result = await this.dispatchWithFailover((service) => {
        if (!service.detectPageCategory) {
          return Promise.resolve({ success: false, error: 'detectPageCategory not supported' });
        }
        return service.detectPageCategory(pageContext);
      });
      return result;
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  }

  async classifyPdfParagraphs(
    paragraphs: Array<{ id: string; text: string }>,
  ): Promise<ClassifyPdfParagraphsResult> {
    try {
      const result = await this.dispatchWithFailover((service) => {
        if (!service.classifyPdfParagraphs) {
          return Promise.resolve({ success: false, error: 'classifyPdfParagraphs not supported', labels: {} } as ClassifyPdfParagraphsResult);
        }
        return service.classifyPdfParagraphs(paragraphs);
      });
      return result;
    } catch (error) {
      return { success: false, error: errorMessage(error), labels: {} };
    }
  }

  async resegmentYoutubeAsr(
    units: AsrTimedUnit[],
    language: string,
  ): Promise<ResegmentYoutubeAsrResult> {
    try {
      const result = await this.dispatchWithFailover((service) => {
        if (!service.resegmentYoutubeAsr) {
          return Promise.resolve({
            success: false,
            error: 'resegmentYoutubeAsr not supported',
          });
        }
        return service.resegmentYoutubeAsr(units, language);
      });
      return result;
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  }

  /** Snapshot a single key's status (for the UI badge). */
  getKeyStatus(keyId: string): KeyStatus {
    const state = this.breaker.getState(keyId);
    return {
      keyId,
      providerId: this.keyToProvider.get(keyId) ?? '',
      open: state.open && this.clock() < state.openUntil,
      openUntil: state.openUntil,
      credentialInvalid: state.credentialInvalid,
      lastFailureKind: state.lastFailureKind,
      disabled: this.disabledKeyIds.has(keyId),
    };
  }

  /** Snapshot all key statuses (for the UI manager list). */
  getAllKeyStatuses(): Record<string, KeyStatus> {
    const out: Record<string, KeyStatus> = {};
    for (const keyId of this.keyToProvider.keys()) {
      out[keyId] = this.getKeyStatus(keyId);
    }
    return out;
  }

  /** Number of currently-enabled slots. */
  getPoolSize(): number {
    return this.slots.length;
  }

  /**
   * Core dispatch loop: round-robin pick → acquire limiter (inside the member
   * service's fetchWithRetry) → call → on thrown error, classify + open the
   * breaker for eligible failures, then retry the next healthy slot. Bounded
   * by the count of slots that were healthy at dispatch time.
   *
   * FR-3 (cursor over healthy pool): the cursor advances over the HEALTHY
   * subset's own index space, not the full slots array. Before this fix, the
   * cursor advanced in [0, slots.length) but indexed the filtered `healthy[]`,
   * so when any slot was open the indices misaligned and the modulo fallback
   * skewed distribution / re-selected a failing slot within one failover
   * chain. Now:
   *  - `healthy[]` is computed once at dispatch entry.
   *  - The round-robin cursor advances ONCE per request over healthy-space
   *    (we snapshot its position into the healthy array).
   *  - Failover walks the REMAINING healthy slots sequentially (a `tried` set
   *    guarantees no revisit), recomputing the healthy pool after each open.
   */
  /**
   * FR-5: acquire a per-key concurrency slot. If `concurrencyLimit > 0` and the
   * key already has `concurrencyLimit` in-flight requests, the caller awaits a
   * FIFO queue position. Returns a `release` fn that must be called in `finally`.
   * When `concurrencyLimit === 0`, this is a no-op (uses the global semaphore
   * cap only) — preserving the pre-FR-5 default behavior.
   */
  private async acquireKeySlot(slot: PoolSlot): Promise<() => void> {
    const limit = slot.concurrencyLimit;
    if (!limit || limit <= 0) {
      // No per-key cap — track in-flight anyway for status, release is a no-op.
      this.inFlight.set(slot.keyId, (this.inFlight.get(slot.keyId) ?? 0) + 1);
      return () => {
        const n = (this.inFlight.get(slot.keyId) ?? 1) - 1;
        this.inFlight.set(slot.keyId, Math.max(0, n));
      };
    }
    const current = this.inFlight.get(slot.keyId) ?? 0;
    if (current >= limit) {
      // Block until a slot frees up.
      await new Promise<void>((resolve) => {
        const queue = this.keyQueues.get(slot.keyId) ?? [];
        queue.push(resolve);
        this.keyQueues.set(slot.keyId, queue);
      });
    }
    this.inFlight.set(slot.keyId, (this.inFlight.get(slot.keyId) ?? 0) + 1);
    return () => {
      const n = (this.inFlight.get(slot.keyId) ?? 1) - 1;
      this.inFlight.set(slot.keyId, Math.max(0, n));
      const queue = this.keyQueues.get(slot.keyId);
      const next = queue?.shift();
      if (next) next();
    };
  }

  /**
   * FR-5: per-key throttle. Sleeps the configured `interval` ms since the last
   * dispatched request on this key, if an interval is set. No-op when 0.
   */
  private async applyKeyThrottle(slot: PoolSlot): Promise<void> {
    if (!slot.interval || slot.interval <= 0) return;
    const last = this.lastDispatchAt.get(slot.keyId);
    const now = this.clock();
    if (last !== undefined) {
      const elapsed = now - last;
      const wait = slot.interval - elapsed;
      if (wait > 0) await this.delay(wait);
    }
    this.lastDispatchAt.set(slot.keyId, this.clock());
  }

  /**
   * Earliest absolute openUntil among currently-open slots, or undefined when
   * no slot is open / pool is empty. Used to surface a retry countdown.
   */
  private earliestOpenUntil(now: number): number | undefined {
    let earliest: number | undefined;
    for (const slot of this.slots) {
      const st = this.breaker.getState(slot.keyId);
      if (!st.open || st.openUntil <= now) continue;
      if (earliest === undefined || st.openUntil < earliest) {
        earliest = st.openUntil;
      }
    }
    return earliest;
  }

  private async dispatchWithFailover<T>(
    call: (service: TranslationService) => Promise<T>,
  ): Promise<T> {
    const now = this.clock();
    const healthy = healthySlots(this.slots, this.breaker, now);
    if (healthy.length === 0) {
      if (this.slots.length === 0) {
        throw new PoolExhaustedError(
          'Translation pool is empty — no providers configured.',
          new Error('No providers are configured in the pool.'),
        );
      }
      const openUntil = this.earliestOpenUntil(now);
      throw new PoolExhaustedError(
        'All providers are cooling down or rate-limited. Wait for cooldown, then retry.',
        new Error(
          `All ${this.slots.length} pool slot(s) are open (rate-limited or errored); ` +
            'none are eligible for dispatch right now.',
        ),
        openUntil,
      );
    }

    // FR-3: the cursor advances over the HEALTHY subset's own index space.
    // Feed the cursor healthy.length so its modulo wrap matches the array we
    // index. The cursor advances once PER ATTEMPT (not once per request): on a
    // failover, each successive attempt calls next() again, so after a dispatch
    // the cursor sits at the last-attempted slot and the NEXT request rotates
    // to the slot after it — giving even distribution across requests even when
    // a previous request consumed multiple slots via failover.
    this.cursor.setSlotCount(healthy.length);

    let lastError: Error = new Error(
      'Provider pool dispatch made no attempts (unexpected).',
    );
    // Track tried key ids so a failover chain never revisits a slot it already
    // attempted (the failed slot is also now open, but the explicit set makes
    // the invariant obvious and survives any breaker-clock skew).
    const tried = new Set<string>();

    // Bounded by the healthy count — guarantees termination.
    for (let attempt = 0; attempt < healthy.length; attempt++) {
      // Advance the cursor for each attempt; skip any already-tried slot. No
      // modulo-fallback: every healthy index is real.
      let idx = this.cursor.next();
      if (idx === null) break;
      let slot = healthy[idx];
      let probes = 0;
      while (slot && tried.has(slot.keyId) && probes < healthy.length) {
        probes++;
        idx = this.cursor.next();
        if (idx === null) break;
        slot = healthy[idx];
      }
      if (!slot) break;
      tried.add(slot.keyId);
      const member = this.members.get(slot.keyId);
      if (!member) continue;

      // FR-5: acquire a per-key concurrency slot before dispatch, then apply
      // the per-key throttle interval. Release in finally so the slot frees up
      // on both success and failure (failover).
      const releaseKeySlot = await this.acquireKeySlot(slot);
      try {
        await this.applyKeyThrottle(slot);
        const result = await call(member.service);
        this.breaker.recordSuccess(slot.keyId);
        return result;
      } catch (error) {
        // Normalize: lastError is always a real Error (FR-8 #11) so callers
        // reading .lastError.message never throw.
        lastError = error instanceof Error ? error : new Error(String(error));
        const statusCode = error instanceof ApiError ? error.statusCode : undefined;
        const kind = this.breaker.classifyFailure(statusCode);
        if (kind !== 'clientError') {
          // Eligible failure: open the breaker and fail over to the next slot.
          this.breaker.recordFailure(slot.keyId, kind, this.clock());
          // If no healthy slots remain (recomputed), surface the last error.
          const failNow = this.clock();
          const remaining = healthySlots(this.slots, this.breaker, failNow);
          if (remaining.length === 0) {
            throw new PoolExhaustedError(
              'All providers are cooling down or rate-limited. Wait for cooldown, then retry.',
              lastError,
              this.earliestOpenUntil(failNow),
            );
          }
          continue;
        }
        // Non-eligible (clientError): surface directly, no failover.
        throw error;
      } finally {
        // FR-5: release the per-key concurrency slot on every exit path.
        releaseKeySlot();
      }
    }

    const exhaustNow = this.clock();
    throw new PoolExhaustedError(
      'All providers are cooling down or rate-limited. Wait for cooldown, then retry.',
      lastError,
      this.earliestOpenUntil(exhaustNow),
    );
  }

  /** Test a specific key directly (per-key "Test" button from the UI). */
  private async testSpecificKey(
    keyId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const member = this.members.get(keyId);
    if (!member) {
      return { success: false, error: 'Key not found in pool' };
    }
    try {
      const result = await member.service.testConnection();
      if (result.success) {
        this.breaker.recordSuccess(keyId);
      }
      return result;
    } catch (error) {
      const statusCode = error instanceof ApiError ? error.statusCode : undefined;
      const kind = this.breaker.classifyFailure(statusCode);
      if (kind !== 'clientError') {
        this.breaker.recordFailure(keyId, kind, this.clock());
      }
      return { success: false, error: errorMessage(error) };
    }
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

// Re-export the pure helpers so callers (background.ts) can reach them from one
// import if needed.
export { resolveSlots, healthySlots };
export type { PoolSlot };
export type { PoolProvider };
