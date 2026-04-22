import type { SiteRule } from '@/types/config';

/**
 * Match a hostname against a pattern.
 * Supports exact match and wildcard patterns (e.g. `*.example.com`).
 * Wildcard `*.example.com` matches `sub.example.com` but NOT `example.com`.
 */
export function matchHostname(hostname: string, pattern: string): boolean {
  if (!hostname || !pattern) return false;

  const h = hostname.toLowerCase();
  const p = pattern.toLowerCase();

  if (p.startsWith('*.')) {
    const suffix = p.slice(1); // e.g. ".example.com"
    return h.endsWith(suffix) && h.length > suffix.length;
  }

  return h === p;
}

/**
 * Find the first matching SiteRule for a given hostname.
 */
export function findMatchingRule(
  hostname: string,
  rules: SiteRule[],
): SiteRule | undefined {
  return rules.find((rule) => matchHostname(hostname, rule.hostname));
}
