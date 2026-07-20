/**
 * URL / hostname blocklist matcher for inline input translation.
 */

/** Built-in seed patterns (also in DEFAULT_INLINE_TRANSLATE_BLOCKLIST) */
export const DEFAULT_BLOCKLIST_PATTERNS: string[] = [
  '*notion.so',
  '*notion.site',
  '*figma.com',
  '*larksuite.com',
  '*feishu.cn',
  '*feishu.net',
  '*docs.google.com',
  '*sheets.google.com',
];

/**
 * Convert a simple wildcard pattern to a RegExp.
 * Supports `*` anywhere (hostname or full URL style).
 * Patterns without scheme match against hostname (and host+path lightly).
 *
 * FR-28: for hostname patterns like `*figma.com`, the leading `*` is treated as
 * a subdomain/empty-label wildcard with a dot boundary — NOT a free suffix on
 * the previous label (`evilfigma.com` must not match).
 */
export function patternToRegExp(pattern: string): RegExp {
  const trimmed = pattern.trim();
  // Hostname-only `*domain.tld` / `*.domain.tld` → boundary-safe host match
  if (!trimmed.includes('://') && !trimmed.includes('/') && trimmed.includes('*')) {
    if (trimmed.startsWith('*.')) {
      const suffix = trimmed.slice(2).replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      // sub.domain.tld only (not bare domain.tld — matches siteRules *. semantics)
      return new RegExp(`^.+\\.${suffix}$`, 'i');
    }
    if (trimmed.startsWith('*') && !trimmed.startsWith('*.')) {
      // *figma.com → figma.com OR *.figma.com (dot boundary before figma)
      const rest = trimmed.slice(1).replace(/^\./, '');
      const escaped = rest.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^(.+\\.)?${escaped}$`, 'i');
    }
  }
  // Escape regex specials except *
  const escaped = trimmed
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

/** FR-28: hostname match with label boundary (no evilfigma.com ⊆ *figma.com). */
export function hostnameMatchesBlockPattern(hostname: string, pattern: string): boolean {
  const h = hostname.toLowerCase();
  const p = pattern.trim().toLowerCase();
  if (!h || !p) return false;
  if (!p.includes('*')) {
    return h === p;
  }
  if (p.startsWith('*.')) {
    const suffix = p.slice(1); // .example.com
    return h.endsWith(suffix) && h.length > suffix.length && h !== suffix.slice(1);
  }
  if (p.startsWith('*')) {
    const domain = p.slice(1).replace(/^\./, ''); // figma.com
    return h === domain || h.endsWith(`.${domain}`);
  }
  // Mid-string wildcards — fall back to regex
  return patternToRegExp(p).test(h);
}

/**
 * Test whether a URL or hostname matches any blocklist pattern.
 */
export function isUrlBlocked(
  urlOrHost: string,
  patterns: string[] = DEFAULT_BLOCKLIST_PATTERNS,
): boolean {
  if (!patterns.length) return false;

  let hostname: string;
  let href: string;
  try {
    if (urlOrHost.includes('://')) {
      const u = new URL(urlOrHost);
      hostname = u.hostname;
      href = u.href;
    } else {
      // bare host or host/path
      hostname = urlOrHost.split('/')[0].split(':')[0];
      href = urlOrHost;
    }
  } catch {
    hostname = urlOrHost;
    href = urlOrHost;
  }

  for (const raw of patterns) {
    const p = raw.trim();
    if (!p) continue;

    // Hostname-style patterns (FR-28: boundary-safe; evilfigma.com must NOT match *figma.com)
    if (!p.includes('://') && !p.includes('/')) {
      if (hostnameMatchesBlockPattern(hostname, p)) return true;
      continue;
    }

    // Full URL / path patterns
    const re = patternToRegExp(p);
    if (re.test(href) || re.test(hostname)) return true;
  }

  return false;
}

/**
 * Merge user patterns with defaults.
 * Policy: user list is used as-is when non-empty; empty → defaults.
 * Callers that want "defaults + user extras" should pass concatenated arrays.
 */
export function resolveBlocklistPatterns(
  userPatterns: string[] | undefined | null,
  defaults: string[] = DEFAULT_BLOCKLIST_PATTERNS,
): string[] {
  if (!userPatterns || userPatterns.length === 0) {
    return [...defaults];
  }
  return [...userPatterns];
}

/** Convenience: check current page location against patterns */
export function isCurrentPageBlocked(
  patterns: string[],
  loc: Pick<Location, 'href' | 'hostname'> = location,
): boolean {
  return isUrlBlocked(loc.href, patterns) || isUrlBlocked(loc.hostname, patterns);
}
