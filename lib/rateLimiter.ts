/**
 * Sliding-window RPM (requests-per-minute) rate limiter — PURE module.
 *
 * Tracks request-start timestamps in a rolling 60-second window. When the
 * number of recorded timestamps reaches `maxRpm`, `acquire()` waits until the
 * oldest timestamp exits the window (i.e., ≥ 60s have passed since it was
 * recorded), then records a new timestamp and resolves.
 *
 * - `maxRpm <= 0` = **unlimited** (fast-path: `acquire()` is a synchronous
 *   no-op with zero timestamp tracking and zero added latency).
 * - Memory is bounded: the timestamp array never exceeds `maxRpm` entries
 *   (pruned on every `acquire` call).
 * - `setMaxRpm(n)` allows live reconfiguration without recreating the limiter.
 * - Uses a `delay()` helper wrapping `setTimeout` so Vitest fake timers work
 *   deterministically (same pattern as `lib/subtitleRetry.ts`).
 */

const WINDOW_MS = 60_000;

/** Promise-based delay. Uses setTimeout so fake timers can advance it in tests. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RateLimiter {
  /** Wait until a slot is available in the rolling window, then record it. */
  acquire(): Promise<void>;
  /** Live-reconfigure the RPM cap (0 or negative = unlimited). */
  setMaxRpm(n: number): void;
  /** Current RPM cap. */
  getMaxRpm(): number;
  /** Test-only: inspect the internal timestamp window. */
  __stateForTest?: { window: number[] };
}

export function createRateLimiter(maxRpm: number): RateLimiter {
  let cap = maxRpm;
  const window: number[] = [];

  const limiter: RateLimiter = {
    async acquire(): Promise<void> {
      // Unlimited fast-path: no tracking, zero latency.
      if (cap <= 0) return;

      // Loop: prune expired timestamps, then check if a slot is available.
      // If at cap, wait for the oldest timestamp to expire and re-check.
      for (;;) {
        const now = Date.now();
        // Prune timestamps older than WINDOW_MS.
        while (window.length > 0 && window[0] <= now - WINDOW_MS) {
          window.shift();
        }

        if (window.length < cap) {
          window.push(now);
          return;
        }

        // At cap — compute how long until the oldest timestamp exits the window.
        const waitMs = WINDOW_MS - (now - window[0]) + 1;
        await delay(waitMs);
        // Loop back: prune + re-check (the window may have shifted further).
      }
    },

    setMaxRpm(n: number): void {
      cap = n;
      // If switching to unlimited, clear the window (no tracking needed).
      if (n <= 0) window.length = 0;
    },

    getMaxRpm(): number {
      return cap;
    },

    __stateForTest: { window },
  };

  return limiter;
}
