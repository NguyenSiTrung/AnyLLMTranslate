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

/**
 * Read the HTTP status code carried by a thrown translation error, unwrapping
 * the provider pool's `PoolExhaustedError.lastError` wrapper.
 *
 * Structural (`name`-free shape) rather than `instanceof` on purpose: this
 * module stays dependency-free, so it can be imported from the content script,
 * the service worker, and tests alike without pulling `ApiError` /
 * `PoolExhaustedError` (and their transitive imports) into the bundle.
 *
 * The pool throws in two shapes:
 *  - `ApiError` (own `statusCode`) for a client error it does not fail over on;
 *  - `PoolExhaustedError` (own `lastError`) when every slot is cooling down or
 *    the failure was classified as retryable-with-failover and no slot is left.
 */
export function extractTranslationErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const outer = error as { statusCode?: unknown; lastError?: unknown };
  if (typeof outer.statusCode === 'number') return outer.statusCode;
  const inner = outer.lastError;
  if (inner && typeof inner === 'object') {
    const innerStatus = (inner as { statusCode?: unknown }).statusCode;
    if (typeof innerStatus === 'number') return innerStatus;
  }
  return undefined;
}

/**
 * Whether a subtitle chunk failure is worth retrying.
 *
 * Retries: network/transport failures, timeouts, 408, 429 rate limits, and 5xx
 * server errors — these can succeed on the next attempt.
 *
 * Fails fast: 4xx client errors (400 bad request/model, 401/403 credentials,
 * 404 model not found, 422 unprocessable). Re-sending the identical request
 * cannot succeed, so retrying only adds latency and burns provider quota.
 * Previously the call site used `shouldRetry: () => true`, which retried those
 * twice with backoff.
 *
 * Errors with no visible status (plain content failures like an unparseable
 * response, or a pool with no healthy slot) are retried: a parse flake can
 * recover and a cooling breaker may reopen before the next attempt.
 */
export function isRetryableTranslationError(error: unknown): boolean {
  const status = extractTranslationErrorStatus(error);
  if (status === undefined) return true;
  if (status === 408 || status === 429) return true;
  if (status >= 500) return true;
  if (status >= 400) return false;
  // Out-of-range status (e.g. 0 from a synthetic error) — be permissive.
  return true;
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
