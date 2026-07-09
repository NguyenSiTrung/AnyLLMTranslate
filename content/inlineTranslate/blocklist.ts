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
 */
export function patternToRegExp(pattern: string): RegExp {
  const trimmed = pattern.trim();
  // Escape regex specials except *
  const escaped = trimmed
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
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

    // Hostname-style: *figma.com → match hostname or endsWith
    if (!p.includes('://') && !p.includes('/')) {
      const re = patternToRegExp(p);
      if (re.test(hostname)) return true;
      // Also allow *.domain.com style against full host
      if (p.startsWith('*') && !p.startsWith('*.')) {
        const suffix = p.slice(1); // e.g. figma.com from *figma.com
        if (
          hostname === suffix.replace(/^\./, '') ||
          hostname.endsWith(suffix.startsWith('.') ? suffix : `.${suffix.replace(/^\./, '')}`) ||
          hostname.endsWith(suffix)
        ) {
          return true;
        }
      }
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
