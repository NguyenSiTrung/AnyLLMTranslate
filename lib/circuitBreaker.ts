/**
 * Circuit breaker for the provider pool — PURE module.
 *
 * Tracks per-key health so the round-robin coordinator can skip open slots and
 * fail over to the next healthy key (FR-4). All state is keyed by the stable
 * {@link PoolKey.id} so circuit state survives a coordinator rebuild as long
 * as the key identity is unchanged.
 *
 * Failure classification (FR-4):
 *  - `rateLimit` (429) / `serverError` (5xx) / `network` → escalating cooldown
 *    60s → 120s → 300s (capped). The slot auto-rejoins when `now >= openUntil`.
 *  - `auth` (401/403) → long-open (1 hour) + `credentialInvalid` flag. The user
 *    is nudged to fix the key; re-test clears it via `recordSuccess`.
 *  - `clientError` (other 4xx) → no cooldown (request-specific, surfaces to
 *    caller). Does NOT increment the escalation counter.
 *
 * NFR-1: pure — takes an injectable `clock` (defaults to `Date.now`) so Vitest
 * fake timers / explicit `now` arguments work deterministically. No chrome API.
 * NFR-6: SW-restart-safe — `openUntil` is an absolute wall-clock timestamp, so
 * `isHealthy(id, now)` recomputes correctly after eviction with no in-memory
 * dependency on timers firing.
 */

/** Discriminator for how a failure should affect the breaker. */
export type FailureKind = 'rateLimit' | 'serverError' | 'network' | 'auth' | 'clientError';

/** Public, serializable view of a slot's breaker state (for UI badges). */
export interface BreakerSlotState {
  /** True while the slot is in cooldown / open and must be skipped. */
  open: boolean;
  /** Absolute wall-clock ms timestamp when the slot auto-rejoins. */
  openUntil: number;
  /** Consecutive cooldown-eligible failures (drives escalation). Resets on success. */
  consecutiveFailures: number;
  /** True when the most recent failure was an auth (401/403) — UI nudges the user. */
  credentialInvalid: boolean;
  /** Human-readable label for the failure kind that opened the slot, if any. */
  lastFailureKind?: FailureKind;
}

/** Configurable breaker parameters (exposed for tests + future tuning). */
export interface CircuitBreakerOptions {
  /** Clock function — defaults to Date.now. Inject for fake-timer tests. */
  clock?: () => number;
  /** Base cooldown ms for the first rateLimit/serverError/network failure. */
  baseCooldownMs?: number;
  /** Long-open cooldown ms for auth failures. */
  authOpenMs?: number;
  /** Cooldown escalation ladder (index by consecutiveFailures-1, capped). */
  escalationLadderMs?: number[];
}

const DEFAULT_BASE_COOLDOWN_MS = 60_000;
const DEFAULT_AUTH_OPEN_MS = 60 * 60_000; // 1 hour
const DEFAULT_ESCALATION_LADDER_MS = [60_000, 120_000, 300_000]; // 60s → 120s → 300s

export interface CircuitBreaker {
  /** True if the slot is closed/healthy (eligible for dispatch). */
  isHealthy(id: string, now?: number): boolean;
  /** Snapshot the slot state (for UI badges / debugging). */
  getState(id: string): BreakerSlotState;
  /** Record a success — resets escalation + clears credentialInvalid. */
  recordSuccess(id: string): void;
  /** Record a failure of the given kind at `now`. */
  recordFailure(id: string, kind: FailureKind, now?: number): void;
  /** Map an HTTP statusCode (or undefined for network errors) → FailureKind. */
  classifyFailure(statusCode: number | undefined): FailureKind;
  /** Force-open a slot until `openUntil` (UI-driven disable / external signal). */
  openLong(id: string, openUntil: number): void;
  /** Test-only: wipe all slot state. */
  __resetForTest(): void;
}

export function createCircuitBreaker(options: CircuitBreakerOptions = {}): CircuitBreaker {
  const clock = options.clock ?? (() => Date.now());
  const ladder = options.escalationLadderMs ?? DEFAULT_ESCALATION_LADDER_MS;
  const baseCooldown = options.baseCooldownMs ?? DEFAULT_BASE_COOLDOWN_MS;
  const authOpenMs = options.authOpenMs ?? DEFAULT_AUTH_OPEN_MS;
  const cap = ladder[ladder.length - 1] ?? baseCooldown;

  const slots = new Map<string, BreakerSlotState>();

  function getOrCreate(id: string): BreakerSlotState {
    let st = slots.get(id);
    if (!st) {
      st = {
        open: false,
        openUntil: 0,
        consecutiveFailures: 0,
        credentialInvalid: false,
      };
      slots.set(id, st);
    }
    return st;
  }

  function cooldownFor(consecutiveFailures: number): number {
    // 1st failure → ladder[0]=60s, 2nd → ladder[1]=120s, 3rd+ → ladder[2]=300s (cap)
    const idx = Math.min(consecutiveFailures - 1, ladder.length - 1);
    return ladder[idx] ?? cap;
  }

  return {
    isHealthy(id, now) {
      const t = now ?? clock();
      const st = slots.get(id);
      if (!st) return true;
      if (!st.open) return true;
      if (t >= st.openUntil) {
        // Cooldown expired — auto-rejoin (lazy evaluation, no timer needed).
        return true;
      }
      return false;
    },

    getState(id) {
      const st = slots.get(id);
      if (!st) {
        return {
          open: false,
          openUntil: 0,
          consecutiveFailures: 0,
          credentialInvalid: false,
        };
      }
      return { ...st };
    },

    recordSuccess(id) {
      const st = getOrCreate(id);
      st.consecutiveFailures = 0;
      st.open = false;
      st.openUntil = 0;
      st.credentialInvalid = false;
      st.lastFailureKind = undefined;
    },

    recordFailure(id, kind, now) {
      const t = now ?? clock();
      const st = getOrCreate(id);
      st.lastFailureKind = kind;

      if (kind === 'auth') {
        // Long-open + credential flag. Fixed window (no escalation) — the user
        // must fix the credential; auto-rejoin after the window for a retry.
        st.open = true;
        st.openUntil = t + authOpenMs;
        st.credentialInvalid = true;
        // Auth does not feed the rateLimit escalation counter.
        return;
      }

      if (kind === 'clientError') {
        // Request-specific (bad prompt, 400, 404…) — no cooldown, no escalation.
        return;
      }

      // rateLimit / serverError / network → escalating cooldown.
      st.consecutiveFailures += 1;
      const cooldown = cooldownFor(st.consecutiveFailures);
      st.open = true;
      st.openUntil = t + cooldown;
      st.credentialInvalid = false;
    },

    classifyFailure(statusCode) {
      if (statusCode === undefined) return 'network';
      if (statusCode === 429) return 'rateLimit';
      if (statusCode === 401 || statusCode === 403) return 'auth';
      if (statusCode >= 500) return 'serverError';
      return 'clientError';
    },

    openLong(id, openUntil) {
      const st = getOrCreate(id);
      st.open = true;
      st.openUntil = openUntil;
    },

    __resetForTest() {
      slots.clear();
    },
  };
}
