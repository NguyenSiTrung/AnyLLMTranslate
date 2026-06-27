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
import type { ClassifyPdfParagraphsResult } from '@/types/messages';
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
 */
export class PoolExhaustedError extends Error {
  readonly lastError: Error;
  constructor(message: string, lastError: Error) {
    super(message);
    this.name = 'PoolExhaustedError';
    this.lastError = lastError;
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

  /** All currently-enabled slots (the rotation universe). */
  private slots: PoolSlot[] = [];
  /** keyId → member service, kept in sync with `slots`. */
  private members: Map<string, MemberRecord> = new Map();
  /** Tracks which keyIds are disabled (for status reporting). */
  private disabledKeyIds: Set<string> = new Set();
  /** keyId → providerId, for status reporting. */
  private keyToProvider: Map<string, string> = new Map();

  constructor(options: ProviderPoolCoordinatorOptions = {}) {
    this.serviceFactory =
      options.serviceFactory ??
      ((config) => new OpenAICompatibleService(config));
    this.clock = options.clock ?? (() => Date.now());
    this.breaker = createCircuitBreaker({ clock: this.clock });
    this.cursor = createPoolCursor(0);
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
      throw new PoolExhaustedError(
        'All provider pool slots are currently open (rate-limited or errored).',
        new Error(
          `All ${this.slots.length} pool slot(s) are open (rate-limited or errored); ` +
            'none are eligible for dispatch right now.',
        ),
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

      try {
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
          const remaining = healthySlots(this.slots, this.breaker, this.clock());
          if (remaining.length === 0) {
            throw new PoolExhaustedError(
              'All provider pool slots failed during this request.',
              lastError,
            );
          }
          continue;
        }
        // Non-eligible (clientError): surface directly, no failover.
        throw error;
      }
    }

    throw new PoolExhaustedError(
      'Provider pool dispatch exhausted all attempts.',
      lastError,
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
