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
  rules: SiteRule[] = [],
): SiteRule | undefined {
  return rules.find((rule) => matchHostname(hostname, rule.hostname));
}

/**
 * Merge global exclude selectors with per-site exclude selectors.
 * Returns a deduplicated union of both arrays. Global selectors come first.
 */
export function mergeExcludeSelectors(
  globalExcludes: string[],
  siteExcludes: string[] | undefined,
): string[] {
  if (!siteExcludes || siteExcludes.length === 0) return globalExcludes;
  if (globalExcludes.length === 0) return siteExcludes;

  const seen = new Set(globalExcludes);
  const merged = [...globalExcludes];
  for (const sel of siteExcludes) {
    if (!seen.has(sel)) {
      merged.push(sel);
      seen.add(sel);
    }
  }
  return merged;
}

/** Built-in site rules for common platforms — user rules take precedence. */
export const BUILT_IN_RULES: SiteRule[] = [
  {
    id: 'builtin-github',
    hostname: '*.github.com',
    includeSelectors: ['.markdown-body', '.comment-body', '.js-issue-title'],
    excludeSelectors: ['.highlight', 'pre', 'code'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-github-root',
    hostname: 'github.com',
    includeSelectors: ['.markdown-body', '.comment-body', '.js-issue-title'],
    excludeSelectors: ['.highlight', 'pre', 'code'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-stackoverflow',
    hostname: 'stackoverflow.com',
    includeSelectors: ['.js-post-body', '.question-hyperlink', '.comment-copy'],
    excludeSelectors: ['pre', 'code', '.snippet-code'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-reddit',
    hostname: '*.reddit.com',
    includeSelectors: ['[data-testid="comment"]', '.md', 'h1'],
    excludeSelectors: ['.flair', '.score'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-twitter',
    hostname: 'twitter.com',
    includeSelectors: ['[data-testid="tweetText"]'],
    excludeSelectors: ['[data-testid="User-Name"]'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-x',
    hostname: 'x.com',
    includeSelectors: ['[data-testid="tweetText"]'],
    excludeSelectors: ['[data-testid="User-Name"]'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-wikipedia',
    hostname: '*.wikipedia.org',
    includeSelectors: ['#mw-content-text'],
    excludeSelectors: ['.reflist', '.navbox', '.infobox', '.toc'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-medium',
    hostname: 'medium.com',
    includeSelectors: ['article p', 'article h1', 'article h2', 'article h3'],
    excludeSelectors: [],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-huggingface',
    hostname: 'huggingface.co',
    includeSelectors: ['.prose', '.markdown'],
    excludeSelectors: ['pre', 'code', '.code-block'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-pypi',
    hostname: 'pypi.org',
    includeSelectors: ['.project-description'],
    excludeSelectors: ['pre', 'code'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-npm',
    hostname: 'www.npmjs.com',
    includeSelectors: ['#readme'],
    excludeSelectors: ['pre', 'code'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-gitlab',
    hostname: '*.gitlab.com',
    includeSelectors: ['.md', '.note-body', '.issue-title-text'],
    excludeSelectors: ['pre', 'code', '.diff-content'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-gitlab-root',
    hostname: 'gitlab.com',
    includeSelectors: ['.md', '.note-body', '.issue-title-text'],
    excludeSelectors: ['pre', 'code', '.diff-content'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-substack',
    hostname: '*.substack.com',
    includeSelectors: ['.body.markup', '.comment-body'],
    excludeSelectors: ['.meta', '.footer'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-youtube',
    hostname: '*.youtube.com',
    includeSelectors: ['#description-text', '#content-text', '#comment-content'],
    excludeSelectors: ['#meta', '.badge-style-type-simple'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-youtube-root',
    hostname: 'youtube.com',
    includeSelectors: ['#description-text', '#content-text', '#comment-content'],
    excludeSelectors: ['#meta', '.badge-style-type-simple'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
];

/**
 * Find the effective SiteRule for a hostname.
 * Checks user-defined rules first, then falls back to built-in rules.
 */
export function findEffectiveRule(
  hostname: string,
  userRules: SiteRule[] = [],
): SiteRule | undefined {
  const userMatch = findMatchingRule(hostname, userRules);
  if (userMatch) return userMatch;
  return findMatchingRule(hostname, BUILT_IN_RULES);
}
