/**
 * Retry and pause classification for web page translation errors (FR-10).
 *
 * String-based because errors reach the content script as messages. Kept apart
 * from `isTransientTranslationError`, which is negative-cache-only and
 * deliberately treats auth/quota as transient (never cache them per text).
 */

/** Auth, key, quota and billing failures: retrying cannot help, the user must act. */
function isAuthOrQuotaError(e: string): boolean {
  return (
    /\b(401|402|403)\b|unauthori[sz]ed|forbidden|payment required/.test(e) ||
    /(invalid|incorrect|missing|expired|revoked).{0,20}api.?key|api.?key.{0,20}(invalid|incorrect|missing|expired|revoked|not valid)/.test(e) ||
    /quota|billing|insufficient.?(funds|credit|balance)|credit balance/.test(e)
  );
}

/**
 * Whether a failed web translation is worth one automatic retry: 408/429/5xx,
 * network, timeouts, parse flakes and provider-pool exhaustion. Never auth,
 * key, quota or billing failures, and never text-scoped or unknown failures.
 */
export function isRetryableWebTranslationError(error: string): boolean {
  const e = error.toLowerCase();
  if (!e || isAuthOrQuotaError(e)) return false;
  return (
    /\b(408|429)\b|rate.?limit|too many requests/.test(e) ||
    /\b5\d\d\b|bad gateway|service unavailable|gateway timeout|internal server error/.test(e) ||
    /timeout|timed out|network|fetch failed|failed to fetch|econnreset|socket|abort/.test(e) ||
    /overloaded|capacity|temporarily|try again|circuit/.test(e) ||
    /parse|empty (streaming )?response|invalid json|unparseable|streaming (failed|port)/.test(e) ||
    /provider pool|all .* (failed|open)|pool is empty|no providers|dispatch exhausted|no attempts/.test(e)
  );
}

/**
 * Whether a failure should enter the provider-failure pause (banner with a
 * settings link): auth/key/quota/billing, plus pool exhaustion and rate limits
 * that would only multiply identical failures as the user scrolls.
 */
export function isProviderPauseError(error: string): boolean {
  const e = error.toLowerCase();
  return (
    isAuthOrQuotaError(e) ||
    /provider pool|all .* (failed|open)|rate.?limit|pool is empty|no providers/.test(e)
  );
}
