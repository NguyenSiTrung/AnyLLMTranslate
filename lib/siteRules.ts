import type { InlineSiteOverride, InlineTranslateSettings, SiteRule } from '@/types/config';

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
 * Specificity score for a hostname pattern (FR-28: most-specific wins).
 * Higher = more specific. Exact host > longer wildcard suffix > shorter.
 */
export function hostnamePatternSpecificity(pattern: string): number {
  const p = pattern.toLowerCase();
  if (!p.startsWith('*.')) {
    // Exact host — highest tier + length
    return 1000 + p.length;
  }
  // Wildcard: longer suffix is more specific (*.docs.google.com > *.google.com)
  return p.length;
}

/**
 * Find the most-specific matching SiteRule for a given hostname (FR-28).
 * Ties break by first occurrence in the rules array (stable, documented order).
 */
export function findMatchingRule(
  hostname: string,
  rules: SiteRule[] = [],
): SiteRule | undefined {
  let best: SiteRule | undefined;
  let bestScore = -1;
  for (const rule of rules) {
    if (!matchHostname(hostname, rule.hostname)) continue;
    const score = hostnamePatternSpecificity(rule.hostname);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  return best;
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
    // Block code only — bare `code` is inline and must stay in prose sentences.
    excludeSelectors: ['.highlight', 'pre'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-github-root',
    hostname: 'github.com',
    includeSelectors: ['.markdown-body', '.comment-body', '.js-issue-title'],
    excludeSelectors: ['.highlight', 'pre'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-stackoverflow',
    hostname: 'stackoverflow.com',
    includeSelectors: ['.js-post-body', '.question-hyperlink', '.comment-copy'],
    excludeSelectors: ['pre', '.snippet-code'],
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
    excludeSelectors: ['pre', '.code-block'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-pypi',
    hostname: 'pypi.org',
    includeSelectors: ['.project-description'],
    excludeSelectors: ['pre'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-npm',
    hostname: 'www.npmjs.com',
    includeSelectors: ['#readme'],
    excludeSelectors: ['pre'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-gitlab',
    hostname: '*.gitlab.com',
    includeSelectors: ['.md', '.note-body', '.issue-title-text'],
    excludeSelectors: ['pre', '.diff-content'],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: true,
  },
  {
    id: 'builtin-gitlab-root',
    hostname: 'gitlab.com',
    includeSelectors: ['.md', '.note-body', '.issue-title-text'],
    excludeSelectors: ['pre', '.diff-content'],
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

/**
 * Built-in inline-translate seeds for chat-style sites: conversation selectors
 * used to pick the reply language. Kept apart from {@link BUILT_IN_RULES}
 * because installs that already stored `siteRules` never receive new built-in
 * rule objects; the resolver layers these under any user rule instead.
 */
export const BUILT_IN_INLINE_SITE_OVERRIDES: ReadonlyArray<{
  hostname: string;
  inlineTranslate: InlineSiteOverride;
}> = (() => {
  const twitter: InlineSiteOverride = {
    autoLanguageSelectors: [
      'parentElementTo [role="dialog"] [data-testid="tweetText"]',
      'article[data-testid="tweet"] [data-testid="tweetText"]',
    ],
  };
  const reddit: InlineSiteOverride = {
    autoLanguageSelectors: [
      'parentElementTo shreddit-comment [slot="comment"]',
      'shreddit-post [slot="text-body"]',
      'shreddit-post [slot="title"]',
    ],
  };
  const youtube: InlineSiteOverride = {
    autoLanguageSelectors: [
      'parentElementTo ytd-comment-thread-renderer #content-text',
      'yt-live-chat-text-message-renderer #message',
      'ytd-watch-metadata #title',
    ],
  };
  return [
    { hostname: 'x.com', inlineTranslate: twitter },
    { hostname: 'twitter.com', inlineTranslate: twitter },
    { hostname: 'reddit.com', inlineTranslate: reddit },
    { hostname: '*.reddit.com', inlineTranslate: reddit },
    { hostname: 'youtube.com', inlineTranslate: youtube },
    { hostname: '*.youtube.com', inlineTranslate: youtube },
    {
      hostname: 'discord.com',
      inlineTranslate: { autoLanguageSelectors: ['[id^="message-content-"]'] },
    },
    {
      hostname: 'web.telegram.org',
      inlineTranslate: {
        autoLanguageSelectors: ['.bubble.is-in .translatable-message', '.message .text-content'],
      },
    },
    {
      hostname: 'web.whatsapp.com',
      inlineTranslate: { autoLanguageSelectors: ['.message-in .selectable-text'] },
    },
  ];
})();

/** Inline settings after per-site overrides, plus the conversation selectors. */
export type ResolvedInlineSiteConfig = InlineTranslateSettings & {
  autoLanguageSelectors: string[];
};

const INLINE_NUMERIC_OVERRIDE_KEYS = [
  'triggerGapMs',
  'idleMs',
  'triggerToleranceCount',
  'cancelWindowMs',
  'minDurationMs',
  'confirmLongTextLength',
] as const;

function applyInlineOverride(target: ResolvedInlineSiteConfig, override: InlineSiteOverride): void {
  for (const key of INLINE_NUMERIC_OVERRIDE_KEYS) {
    const value = override[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      target[key] = value;
    }
  }
  if (typeof override.autoLanguageEnable === 'boolean') {
    target.autoLanguageEnable = override.autoLanguageEnable;
  }
  if (Array.isArray(override.autoLanguageSelectors)) {
    target.autoLanguageSelectors = override.autoLanguageSelectors
      .map((selector) => selector.trim())
      .filter(Boolean);
  }
}

/**
 * Effective inline settings for a hostname: globals ← most-specific built-in
 * seed ← most-specific user rule that carries an `inlineTranslate` override.
 */
export function resolveInlineSiteConfig(
  settings: InlineTranslateSettings,
  hostname: string,
  userRules: SiteRule[] = [],
): ResolvedInlineSiteConfig {
  const resolved: ResolvedInlineSiteConfig = { ...settings, autoLanguageSelectors: [] };

  let seed: InlineSiteOverride | undefined;
  let seedScore = -1;
  for (const entry of BUILT_IN_INLINE_SITE_OVERRIDES) {
    if (!matchHostname(hostname, entry.hostname)) continue;
    const score = hostnamePatternSpecificity(entry.hostname);
    if (score > seedScore) {
      seed = entry.inlineTranslate;
      seedScore = score;
    }
  }
  if (seed) applyInlineOverride(resolved, seed);

  const userRule = findMatchingRule(
    hostname,
    userRules.filter((rule) => rule.inlineTranslate != null),
  );
  if (userRule?.inlineTranslate) applyInlineOverride(resolved, userRule.inlineTranslate);

  return resolved;
}
