/**
 * Classification helpers for translation error strings.
 *
 * The FR-4 negative (failure) cache is keyed by *text*. That only makes sense
 * for failures that are intrinsic to the text (e.g. safety/moderation). Provider
 * pool exhaustion, rate limits, network blips, and parse flakes are NOT
 * text-specific — caching them poisons every future attempt of that paragraph
 * for the full TTL, producing the UX: spinner → fail → click retry → instant OK.
 */

/**
 * True when the error is about infrastructure / the provider / a flaky response,
 * not about this specific source text permanently failing to translate.
 */
export function isTransientTranslationError(error: string): boolean {
  const e = error.toLowerCase();
  return (
    /provider pool|all .* (failed|open)|pool is empty|no providers/.test(e) ||
    /rate.?limit|too many requests|\b429\b/.test(e) ||
    /timeout|timed out|network|fetch failed|econnreset|socket|abort|failed to fetch/.test(e) ||
    /\b(502|503|504)\b|bad gateway|service unavailable|gateway timeout/.test(e) ||
    /overloaded|capacity|temporarily|try again|circuit/.test(e) ||
    /parse|empty (streaming )?response|invalid json|unparseable|streaming (failed|port)/.test(e) ||
    /unauthorized|api key|forbidden|\b401\b|\b403\b|quota|billing/.test(e) ||
    /dispatch exhausted|no attempts/.test(e)
  );
}

/**
 * Whether a failure should be stored in the per-text negative cache.
 * Only content/moderation-style permanent failures qualify — never pool/network.
 */
export function shouldNegativeCacheFailure(error: string): boolean {
  if (!error || isTransientTranslationError(error)) return false;
  // Opt-in: only clearly text/content-scoped permanent failures.
  return /content.?filter|safety|moderation|blocked by|refused to translate|policy/i.test(
    error,
  );
}
