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
 *    scoped to the provider's baseUrl + key + model).
 *  - Round-robin distribution across slots via {@link PoolCursor} (FR-3), or
 *    preferred+failover walk for Google AI Studio multi-model.
 *  - Circuit-breaker failover via {@link CircuitBreaker} (FR-4): on 429/5xx/
 *    network → escalating cooldown + retry next healthy slot; on 401/403 →
 *    long-open + credentialInvalid; on other 4xx → no cooldown (surfaces).
 *  - `rebuild(settings)` live-reconfigures member services in place, preserving
 *    circuit-breaker state for unchanged slot identities (FR-6).
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
 *  per-key / per-model (the production OpenAICompatibleService factory ignores it). */
export type ServiceFactory = (
  config: ProviderConfig,
  slotIdentity: { keyId: string; providerId: string; slotId: string; model: string },
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

/** Public view of a single slot's status — drives the UI badge. */
export interface KeyStatus {
  /** Parent PoolKey id. */
  keyId: string;
  /** Breaker / member identity (keyId or keyId::model). */
  slotId: string;
  /** Model id for this slot. */
  model: string;
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
  /** Rotates which provider group is tried first under preferred multi-model. */
  private readonly providerCursor: PoolCursor;
  private readonly delay: (ms: number) => Promise<void>;

  /** All currently-enabled slots (the rotation universe). */
  private slots: PoolSlot[] = [];
  /** slotId → member service, kept in sync with `slots`. */
  private members: Map<string, MemberRecord> = new Map();
  /** Tracks which keyIds are disabled (for status reporting). */
  private disabledKeyIds: Set<string> = new Set();
  /** keyId → providerId, for status reporting. */
  private keyToProvider: Map<string, string> = new Map();

  // FR-5: per-slot concurrency limit + throttle interval state (keyed by slotId).
  private readonly inFlight: Map<string, number> = new Map();
  private readonly keyQueues: Map<string, Array<() => void>> = new Map();
  private readonly lastDispatchAt: Map<string, number> = new Map();

  constructor(options: ProviderPoolCoordinatorOptions = {}) {
    this.serviceFactory =
      options.serviceFactory ??
      ((config) => new OpenAICompatibleService(config));
    this.clock = options.clock ?? (() => Date.now());
    this.breaker = createCircuitBreaker({ clock: this.clock });
    this.cursor = createPoolCursor(0);
    this.providerCursor = createPoolCursor(0);
    this.delay = options.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * Live-reconfigure member services from settings. Member instances are
   * PRESERVED for any slot whose identity (slotId) is unchanged, so circuit-
   * breaker state and RateLimiter windows survive a rebuild (FR-6). New slots
   * get fresh services; removed slots are dropped.
   */
  rebuild(settings: ExtensionSettings): void {
    const now = this.clock();
    const providers = settings.providers ?? [];

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

    const newMemberIds = new Set(newSlots.map((s) => s.slotId));
    for (const slotId of Array.from(this.members.keys())) {
      if (!newMemberIds.has(slotId)) {
        this.members.delete(slotId);
      }
    }
    for (const slot of newSlots) {
      const existing = this.members.get(slot.slotId);
      if (existing) {
        existing.slot = slot;
        existing.service.updateConfig?.(slot.providerConfig);
      } else {
        this.members.set(slot.slotId, {
          service: this.serviceFactory(slot.providerConfig, {
            keyId: slot.keyId,
            providerId: slot.providerId,
            slotId: slot.slotId,
            model: slot.model,
          }),
          slot,
        });
      }
    }

    this.slots = newSlots;
    this.cursor.setSlotCount(newSlots.length);
    void now;
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    return this.dispatchWithFailover((service) => service.translate(request));
  }

  async translateStream(
    request: TranslationRequest,
    onPiece: (id: string, text: string) => void,
  ): Promise<TranslationResult> {
    return this.dispatchWithFailover((service) => {
      if (service.translateStream) {
        return service.translateStream(request, onPiece);
      }
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
          return Promise.resolve({
            success: false,
            error: 'classifyPdfParagraphs not supported',
            labels: {},
          } as ClassifyPdfParagraphsResult);
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

  /**
   * Snapshot a slot's status. `id` may be a slotId (multi-model) or keyId
   * (single-model, where slotId === keyId).
   */
  getKeyStatus(id: string): KeyStatus {
    const slot = this.slots.find((s) => s.slotId === id || s.keyId === id);
    const slotId = slot?.slotId ?? id;
    const keyId = slot?.keyId ?? id;
    const model = slot?.model ?? '';
    const state = this.breaker.getState(slotId);
    return {
      keyId,
      slotId,
      model,
      providerId: slot?.providerId ?? this.keyToProvider.get(keyId) ?? '',
      open: state.open && this.clock() < state.openUntil,
      openUntil: state.openUntil,
      credentialInvalid: state.credentialInvalid,
      lastFailureKind: state.lastFailureKind,
      disabled: this.disabledKeyIds.has(keyId),
    };
  }

  /**
   * Snapshot all slot statuses (keyed by slotId). Multi-model emits one entry
   * per key×model; single-model keeps keyId as the map key.
   */
  getAllKeyStatuses(): Record<string, KeyStatus> {
    const out: Record<string, KeyStatus> = {};
    if (this.slots.length > 0) {
      for (const slot of this.slots) {
        out[slot.slotId] = this.getKeyStatus(slot.slotId);
      }
      // Disabled keys that never entered rotation still need a status row.
      for (const keyId of this.keyToProvider.keys()) {
        if (this.disabledKeyIds.has(keyId) && !Object.values(out).some((s) => s.keyId === keyId)) {
          out[keyId] = this.getKeyStatus(keyId);
        }
      }
      return out;
    }
    for (const keyId of this.keyToProvider.keys()) {
      out[keyId] = this.getKeyStatus(keyId);
    }
    return out;
  }

  getPoolSize(): number {
    return this.slots.length;
  }

  private isSlotSaturated(slot: PoolSlot): boolean {
    const limit = slot.concurrencyLimit;
    if (!limit || limit <= 0) return false;
    return (this.inFlight.get(slot.slotId) ?? 0) >= limit;
  }

  private async acquireKeySlot(
    slot: PoolSlot,
    blockIfSaturated = true,
  ): Promise<(() => void) | null> {
    const id = slot.slotId;
    const limit = slot.concurrencyLimit;
    if (!limit || limit <= 0) {
      this.inFlight.set(id, (this.inFlight.get(id) ?? 0) + 1);
      return () => {
        const n = (this.inFlight.get(id) ?? 1) - 1;
        this.inFlight.set(id, Math.max(0, n));
      };
    }
    const current = this.inFlight.get(id) ?? 0;
    if (current >= limit) {
      if (!blockIfSaturated) return null;
      await new Promise<void>((resolve) => {
        const queue = this.keyQueues.get(id) ?? [];
        queue.push(resolve);
        this.keyQueues.set(id, queue);
      });
    }
    this.inFlight.set(id, (this.inFlight.get(id) ?? 0) + 1);
    return () => {
      const n = (this.inFlight.get(id) ?? 1) - 1;
      this.inFlight.set(id, Math.max(0, n));
      const queue = this.keyQueues.get(id);
      const next = queue?.shift();
      if (next) next();
    };
  }

  private async applyKeyThrottle(slot: PoolSlot): Promise<void> {
    if (!slot.interval || slot.interval <= 0) return;
    const id = slot.slotId;
    const last = this.lastDispatchAt.get(id);
    const now = this.clock();
    if (last !== undefined) {
      const elapsed = now - last;
      const wait = slot.interval - elapsed;
      if (wait > 0) await this.delay(wait);
    }
    this.lastDispatchAt.set(id, this.clock());
  }

  private earliestOpenUntil(now: number): number | undefined {
    let earliest: number | undefined;
    for (const slot of this.slots) {
      const st = this.breaker.getState(slot.slotId);
      if (!st.open || st.openUntil <= now) continue;
      if (earliest === undefined || st.openUntil < earliest) {
        earliest = st.openUntil;
      }
    }
    return earliest;
  }

  /**
   * Preferred multi-model: walk healthy slots in expansion order (model-major
   * × key) with inter-provider group rotation so later providers are not
   * starved when a Google preferred model is always healthy.
   */
  private buildPreferredAttemptOrder(healthy: PoolSlot[]): PoolSlot[] {
    const providerOrder: string[] = [];
    const seen = new Set<string>();
    for (const s of this.slots) {
      if (!seen.has(s.providerId)) {
        seen.add(s.providerId);
        providerOrder.push(s.providerId);
      }
    }
    const groups = providerOrder
      .map((pid) => healthy.filter((s) => s.providerId === pid))
      .filter((g) => g.length > 0);
    if (groups.length === 0) return [];
    if (groups.length === 1) return groups[0]!;

    this.providerCursor.setSlotCount(groups.length);
    const start = this.providerCursor.next() ?? 0;
    return [...groups.slice(start), ...groups.slice(0, start)].flat();
  }

  private usesPreferredWalk(healthy: PoolSlot[]): boolean {
    return healthy.some(
      (s) => s.multiModel && s.modelStrategy === 'preferred_failover',
    );
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

    const preferredWalk = this.usesPreferredWalk(healthy);
    const attemptOrder = preferredWalk
      ? this.buildPreferredAttemptOrder(healthy)
      : healthy;

    if (!preferredWalk) {
      this.cursor.setSlotCount(healthy.length);
    }

    let lastError: Error = new Error(
      'Provider pool dispatch made no attempts (unexpected).',
    );
    const tried = new Set<string>();

    const maxAttempts = healthy.length * 2;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const allowQueue = attempt >= healthy.length;

      let slot: PoolSlot | undefined;
      if (preferredWalk) {
        for (const candidate of attemptOrder) {
          if (tried.has(candidate.slotId)) continue;
          if (
            !allowQueue &&
            this.isSlotSaturated(candidate) &&
            attemptOrder.some(
              (s) =>
                !tried.has(s.slotId) &&
                s.slotId !== candidate.slotId &&
                !this.isSlotSaturated(s),
            )
          ) {
            continue;
          }
          slot = candidate;
          break;
        }
        if (!slot) break;
      } else {
        let idx = this.cursor.next();
        if (idx === null) break;
        slot = healthy[idx];
        let probes = 0;
        while (slot && tried.has(slot.slotId) && probes < healthy.length) {
          probes++;
          idx = this.cursor.next();
          if (idx === null) break;
          slot = healthy[idx];
        }
        if (!slot) break;

        if (!allowQueue && this.isSlotSaturated(slot)) {
          const freeLeft = healthy.some(
            (s) => !tried.has(s.slotId) && !this.isSlotSaturated(s),
          );
          if (freeLeft) continue;
        }
      }

      tried.add(slot.slotId);
      const member = this.members.get(slot.slotId);
      if (!member) continue;

      const hasFreeSibling = healthy.some(
        (s) =>
          s.slotId !== slot.slotId &&
          !this.isSlotSaturated(s) &&
          !tried.has(s.slotId),
      );
      const blockIfSaturated = allowQueue || !hasFreeSibling;
      const releaseKeySlot = await this.acquireKeySlot(slot, blockIfSaturated);
      if (!releaseKeySlot) {
        tried.delete(slot.slotId);
        continue;
      }

      const otherUntriedHealthy = healthy.some((s) => !tried.has(s.slotId));
      member.service.setMax429Retries?.(otherUntriedHealthy ? 0 : null);

      try {
        await this.applyKeyThrottle(slot);
        const result = await call(member.service);
        this.breaker.recordSuccess(slot.slotId);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const statusCode = error instanceof ApiError ? error.statusCode : undefined;
        const kind = this.breaker.classifyFailure(statusCode);
        if (kind !== 'clientError') {
          this.breaker.recordFailure(slot.slotId, kind, this.clock());
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
        throw error;
      } finally {
        releaseKeySlot();
        member.service.setMax429Retries?.(null);
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
    // Prefer primary model slot for this key (first match in expansion order).
    const slot =
      this.slots.find((s) => s.keyId === keyId) ??
      this.slots.find((s) => s.slotId === keyId);
    const member = slot
      ? this.members.get(slot.slotId)
      : this.members.get(keyId);
    if (!member) {
      return { success: false, error: 'Key not found in pool' };
    }
    const statusId = member.slot.slotId;
    try {
      const result = await member.service.testConnection();
      if (result.success) {
        this.breaker.recordSuccess(statusId);
      }
      return result;
    } catch (error) {
      const statusCode = error instanceof ApiError ? error.statusCode : undefined;
      const kind = this.breaker.classifyFailure(statusCode);
      if (kind !== 'clientError') {
        this.breaker.recordFailure(statusId, kind, this.clock());
      }
      return { success: false, error: errorMessage(error) };
    }
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

export { resolveSlots, healthySlots };
export type { PoolSlot };
export type { PoolProvider };
