/**
 * Generic retry-with-backoff — PURE module.
 *
 * Runs an async function, retrying on failure per a `shouldRetry` predicate,
 * up to `maxRetries` extra attempts, with exponential backoff
 * (`baseDelayMs * 2^(attempt-1)`) between attempts. Operates on THROWN errors.
 *
 * No I/O beyond setTimeout. No DOM. The 4xx fail-fast predicate that mirrors
 * fetchWithRetry is constructed at the call site (it imports ApiError) so this
 * module stays dependency-free.
 */

export interface RetryOptions {
  /** Extra attempts beyond the first (e.g. 2 = 3 total attempts). */
  maxRetries: number;
  /** Base backoff delay in ms; grows as baseDelayMs * 2^(attempt-1). */
  baseDelayMs: number;
  /** Return false to fail-fast (rethrow immediately); true to retry. */
  shouldRetry: (error: unknown) => boolean;
}

/** Promise-based delay. Uses setTimeout so fake timers can advance it in tests. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn`, retrying per shouldRetry up to maxRetries, with exponential backoff
 * between attempts. Rethrows the last error if all attempts are exhausted or
 * shouldRetry returns false.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= opts.maxRetries || !opts.shouldRetry(error)) {
        throw error;
      }
      // Backoff before the next attempt: baseDelayMs * 2^attempt.
      await delay(opts.baseDelayMs * Math.pow(2, attempt));
    }
  }
  // Unreachable — the loop throws on exhaustion — but keeps TS happy.
  throw lastError;
}
