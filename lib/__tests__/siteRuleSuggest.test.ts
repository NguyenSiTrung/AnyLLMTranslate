import { describe, expect, it } from 'vitest';
import { heuristicDraftFromOutline } from '@/lib/siteRuleSuggest/heuristics';
import type { DomOutline, SuggestSiteRuleDraft } from '@/lib/siteRuleSuggest/types';
import { mergeSuggestDraftIntoRuleForm } from '@/lib/siteRuleSuggest/mergeForm';
import { buildSuggestSiteRuleDraft } from '@/lib/siteRuleSuggest/orchestrate';
import { buildDomOutline, OUTLINE_MAX_NODES } from '@/lib/siteRuleSuggest/outline';
import {
  buildSiteRuleSuggestSystemPrompt,
  buildSiteRuleSuggestUserPrompt,
  parseSiteRuleSuggestLlmJson,
} from '@/lib/siteRuleSuggest/prompt';
import {
  sanitizeSelector,
  sanitizeDraft,
} from '@/lib/siteRuleSuggest/sanitize';
import {
  parseSuggestUrl,
  hostnameFromUrl,
  preferHostnamePattern,
  tabUrlMatchesHostname,
} from '@/lib/siteRuleSuggest/url';
import {
  matchHostname,
  findMatchingRule,
  findEffectiveRule,
  mergeExcludeSelectors,
  BUILT_IN_RULES,
} from '@/lib/siteRules';
import type { SiteRule } from '@/types/config';

const outline: DomOutline = {
  url: 'https://docs.example.com/page',
  hostname: 'docs.example.com',
  title: 'Docs',
  nodes: [
    { tag: 'nav', classes: ['nav'], textLength: 20, depth: 1, textSample: 'Home' },
    {
      tag: 'article',
      id: 'post',
      classes: ['post'],
      textLength: 2000,
      depth: 2,
      textSample: 'Hello',
    },
    { tag: 'aside', classes: ['sidebar'], textLength: 100, depth: 2, textSample: 'Ads' },
    { tag: 'pre', classes: ['highlight'], textLength: 500, depth: 3, textSample: 'code' },
  ],
};

describe('heuristicDraftFromOutline', () => {
  it('builds include/exclude selectors and hostname pattern', () => {
    const d = heuristicDraftFromOutline(outline, 'tab');
    expect(d.source).toBe('tab');
    expect(d.hostname).toBe('*.example.com');
    expect(
      d.includeSelectors.some((s) => s.includes('article') || s.includes('#post')),
    ).toBe(true);
    expect(
      d.excludeSelectors.some(
        (s) => s.includes('nav') || s.includes('sidebar') || s.includes('pre'),
      ),
    ).toBe(true);
    expect(d.warnings).toEqual(expect.arrayContaining(['heuristic_only']));
  });
});

const draft: SuggestSiteRuleDraft = {
  hostname: 'example.com',
  includeSelectors: ['main', 'article'],
  excludeSelectors: ['nav'],
  source: 'tab',
  category: 'Tech',
  alwaysTranslate: true,
};

describe('mergeSuggestDraftIntoRuleForm', () => {
  it('applies draft fields for add/edit while preserving non-default mode settings', () => {
    const form = {
      hostname: '',
      includeSelectors: [] as string[],
      excludeSelectors: [] as string[],
      alwaysTranslate: false,
      neverTranslate: false,
      categoryValue: '__none__',
    };
    const next = mergeSuggestDraftIntoRuleForm(form, draft, true);
    expect(next.hostname).toBe('example.com');
    expect(next.includeSelectors).toEqual(['main', 'article']);
    expect(next.excludeSelectors).toEqual(['nav']);
    expect(next.alwaysTranslate).toBe(true);
    expect(next.categoryValue).toBe('Tech');

    const editForm = {
      hostname: 'keep.me',
      includeSelectors: ['.old'],
      excludeSelectors: [] as string[],
      alwaysTranslate: false,
      neverTranslate: false,
      categoryValue: '__none__',
    };
    const editNext = mergeSuggestDraftIntoRuleForm(editForm, draft, false);
    expect(editNext.hostname).toBe('keep.me');
    expect(editNext.includeSelectors).toEqual(['main', 'article']);
    const modeForm = {
      hostname: 'x.com',
      includeSelectors: [] as string[],
      excludeSelectors: [] as string[],
      alwaysTranslate: false,
      neverTranslate: true,
      categoryValue: 'News',
    };
    const modeNext = mergeSuggestDraftIntoRuleForm(modeForm, draft, false);
    expect(modeNext.neverTranslate).toBe(true);
    expect(modeNext.alwaysTranslate).toBe(false);
    expect(modeNext.categoryValue).toBe('News');
  });
});

const sampleOutline: DomOutline = {
  url: 'https://example.com',
  hostname: 'example.com',
  title: 'Ex',
  nodes: [
    { tag: 'main', textLength: 500, depth: 1, textSample: 'Hello world content here' },
    { tag: 'nav', textLength: 20, depth: 1, textSample: 'Home' },
  ],
};

describe('buildSuggestSiteRuleDraft', () => {
  it('prefers open tab and uses LLM JSON', async () => {
    const r = await buildSuggestSiteRuleDraft({
      urlInput: 'https://example.com',
      findOpenTabOutline: async () => sampleOutline,
      loadUrlOutline: async () => {
        throw new Error('should not load');
      },
      runLlm: async () =>
        JSON.stringify({
          hostname: 'example.com',
          includeSelectors: ['main'],
          excludeSelectors: ['nav'],
          rationale: 'Main column',
        }),
    });
    expect(r.success).toBe(true);
    expect(r.draft?.source).toBe('tab');
    expect(r.draft?.includeSelectors).toContain('main');
    expect(r.draft?.warnings ?? []).not.toContain('heuristic_only');
    expect(r.draft?.rationale).toMatch(/main/i);
  });

  it('falls back to loadUrl and heuristics when LLM null', async () => {
    const r = await buildSuggestSiteRuleDraft({
      urlInput: 'https://docs.example.com/x',
      findOpenTabOutline: async () => null,
      loadUrlOutline: async () => ({
        outline: {
          ...sampleOutline,
          hostname: 'docs.example.com',
          url: 'https://docs.example.com/x',
        },
        warnings: ['loaded_in_temp_tab'],
      }),
      runLlm: async () => null,
    });
    expect(r.success).toBe(true);
    expect(r.draft?.source).toBe('fetch');
    expect(r.draft?.warnings).toEqual(
      expect.arrayContaining(['heuristic_only', 'loaded_in_temp_tab']),
    );
  });

  it('errors on bad URLs and when capture fails', async () => {
    const r = await buildSuggestSiteRuleDraft({
      urlInput: 'javascript:alert(1)',
      findOpenTabOutline: async () => null,
      loadUrlOutline: async () => {
        throw new Error('nope');
      },
      runLlm: async () => null,
    });
    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();

    const r2 = await buildSuggestSiteRuleDraft({
      urlInput: 'https://example.com',
      findOpenTabOutline: async () => null,
      loadUrlOutline: async () => {
        throw new Error('net fail');
      },
      runLlm: async () => null,
    });
    expect(r2.success).toBe(false);
  });
});

/** @vitest-environment jsdom */

function dom(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('buildDomOutline', () => {
  it('captures relevant nodes with caps while skipping script/style and empty noise', () => {
    const doc = dom(`<!doctype html><html><head><title>Hello</title></head>
      <body>
        <nav class="top-nav">Home</nav>
        <main id="main"><article class="post content"><p>${'word '.repeat(50)}</p></article></main>
        <aside class="sidebar">Ads</aside>
        <footer>F</footer>
        <pre class="code">x=1</pre>
      </body></html>`);
    const outline = buildDomOutline(doc, {
      url: 'https://example.com/a',
      hostname: 'example.com',
    });
    expect(outline.title).toBe('Hello');
    expect(outline.hostname).toBe('example.com');
    expect(outline.nodes.length).toBeGreaterThan(0);
    expect(outline.nodes.length).toBeLessThanOrEqual(OUTLINE_MAX_NODES);
    const tags = outline.nodes.map((n) => n.tag);
    expect(tags).toEqual(
      expect.arrayContaining(['nav', 'main', 'article', 'aside', 'footer', 'pre']),
    );
    const article = outline.nodes.find((n) => n.tag === 'article');
    expect(article?.id).toBeUndefined();
    expect(article?.classes?.length).toBeGreaterThan(0);
    expect((article?.textSample ?? '').length).toBeLessThanOrEqual(80);
    const noiseDoc = dom(
      `<html><body><script>alert(1)</script><style>x{}</style><div></div><p>Hi there friend</p></body></html>`,
    );
    const noiseOutline = buildDomOutline(noiseDoc, { url: 'https://x.test', hostname: 'x.test' });
    expect(noiseOutline.nodes.every((n) => n.tag !== 'script' && n.tag !== 'style')).toBe(
      true,
    );
  });
});

const promptOutline: DomOutline = {
  url: 'https://example.com',
  hostname: 'example.com',
  title: 'T',
  nodes: [{ tag: 'main', textLength: 100, depth: 1, textSample: 'Hi' }],
};

describe('site rule suggest prompts', () => {
  it('builds JSON-only instructions and embeds the compact outline', () => {
    const s = buildSiteRuleSuggestSystemPrompt();
    expect(s.toLowerCase()).toContain('json');
    expect(s).toContain('includeSelectors');
    expect(s).toContain('excludeSelectors');
    expect(s).toContain('hostname');
    const u = buildSiteRuleSuggestUserPrompt(promptOutline);
    expect(u).toContain('example.com');
    expect(u).toContain('main');

    const p = parseSiteRuleSuggestLlmJson(
      '{"hostname":"example.com","includeSelectors":["main"],"excludeSelectors":["nav"],"rationale":"main content"}',
    );
    expect(p?.hostname).toBe('example.com');
    expect(p?.includeSelectors).toEqual(['main']);

    expect(
      parseSiteRuleSuggestLlmJson(
        '```json\n{"hostname":"a.com","includeSelectors":["main"],"excludeSelectors":[]}\n```',
      )?.hostname,
    ).toBe('a.com');
    expect(parseSiteRuleSuggestLlmJson('sorry')).toBeNull();
  });
});

const base: SuggestSiteRuleDraft = {
  hostname: 'example.com',
  includeSelectors: ['main'],
  excludeSelectors: ['nav'],
  source: 'tab',
};

describe('site-rule suggestion sanitization', () => {
  it('keeps valid selectors, drops junk, and sanitizes draft fields', () => {
    expect(sanitizeSelector(' article.post ')).toBe('article.post');
    expect(sanitizeSelector('')).toBeNull();
    expect(sanitizeSelector('a'.repeat(300))).toBeNull();
    expect(sanitizeSelector('div > script')).toBeNull();
    expect(sanitizeSelector('p:has(script)')).toBeNull();
    const d = sanitizeDraft(
      {
        hostname: '*.Evil.com.',
        includeSelectors: ['main', 'main', ''],
        excludeSelectors: ['nav', 'javascript:x'],
        source: 'fetch',
        alwaysTranslate: true,
        neverTranslate: true,
        warnings: ['spa'],
      },
      base,
    );
    expect(d.hostname).toBe('*.evil.com');
    expect(d.includeSelectors).toEqual(['main']);
    expect(d.excludeSelectors).toEqual(['nav']);
    expect(d.alwaysTranslate).toBeFalsy();
    expect(d.neverTranslate).toBeFalsy();
    expect(d.warnings).toEqual(expect.arrayContaining(['spa']));
  });
});

describe('parseSuggestUrl / hostname helpers', () => {
  it('accepts and rejects normalized suggestion URLs; normalizes hostname patterns and matches tab hostnames', () => {
    const r = parseSuggestUrl('https://www.Example.com/path?q=1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url.protocol).toBe('https:');
      expect(r.url.hostname).toBe('www.example.com');
    }

    expect(parseSuggestUrl('javascript:alert(1)').ok).toBe(false);
    expect(parseSuggestUrl('file:///tmp/x').ok).toBe(false);
    expect(parseSuggestUrl('not a url').ok).toBe(false);

    const schemeless = parseSuggestUrl('example.com/foo');
    expect(schemeless.ok).toBe(true);
    if (schemeless.ok) expect(schemeless.url.protocol).toBe('https:');

    const url = new URL('https://www.example.com/a');
    expect(hostnameFromUrl(url)).toBe('www.example.com');
    expect(preferHostnamePattern('www.example.com')).toBe('example.com');

    expect(preferHostnamePattern('docs.example.com')).toBe('*.example.com');
    expect(preferHostnamePattern('example.com')).toBe('example.com');

    expect(tabUrlMatchesHostname('https://www.example.com/x', 'example.com')).toBe(true);
    expect(tabUrlMatchesHostname('https://other.com', 'example.com')).toBe(false);
    expect(tabUrlMatchesHostname(undefined, 'example.com')).toBe(false);
  });
});

function makeSiteRule(overrides: Partial<SiteRule> & { hostname: string }): SiteRule {
  return {
    id: 'test',
    includeSelectors: [],
    excludeSelectors: [],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: false,
    ...overrides,
  };
}

describe('siteRules', () => {
  it('hostname matching, rule lookup, built-ins, exclude merge, and most-specific match wins', () => {
    expect(matchHostname('Example.COM', 'example.com')).toBe(true);
    expect(matchHostname('sub.example.com', '*.example.com')).toBe(true);
    expect(matchHostname('example.com', '*.example.com')).toBe(false);
    expect(matchHostname('notexample.com', '*.example.com')).toBe(false);
    expect(matchHostname('', 'example.com')).toBe(false);

    const rules: SiteRule[] = [
      makeSiteRule({ id: 'r1', hostname: '*.google.com', alwaysTranslate: true }),
      makeSiteRule({ id: 'r2', hostname: 'example.com', neverTranslate: true }),
      makeSiteRule({ id: 'r3', hostname: '*.example.com', alwaysTranslate: true }),
    ];
    expect(findMatchingRule('docs.google.com', rules)?.id).toBe('r1');
    expect(findMatchingRule('example.com', rules)?.id).toBe('r2');
    expect(findMatchingRule('unknown.org', rules)).toBeUndefined();
    expect(findMatchingRule('example.com', [])).toBeUndefined();
    expect(
      findMatchingRule('sub.example.com', [
        makeSiteRule({ id: 'first', hostname: '*.example.com' }),
        makeSiteRule({ id: 'second', hostname: '*.example.com' }),
      ])?.id,
    ).toBe('first');

    const userRule = makeSiteRule({
      id: 'user-github',
      hostname: 'github.com',
      alwaysTranslate: true,
    });
    expect(findEffectiveRule('github.com', [userRule])?.id).toBe('user-github');
    expect(findEffectiveRule('github.com', [])?.builtIn).toBe(true);
    expect(findEffectiveRule('gist.github.com', [])?.hostname).toBe('*.github.com');
    expect(findEffectiveRule('unknown.example.com', [])).toBeUndefined();

    expect(BUILT_IN_RULES.every((r) => r.builtIn)).toBe(true);
    for (const rule of BUILT_IN_RULES) {
      expect(rule.excludeSelectors).not.toContain('code');
    }
    const github = BUILT_IN_RULES.find((r) => r.hostname === 'github.com');
    expect(github?.includeSelectors).toContain('.markdown-body');
    expect(github?.excludeSelectors).toContain('pre');

    expect(mergeExcludeSelectors(['pre', 'code'], ['pre', '.sidebar'])).toEqual([
      'pre',
      'code',
      '.sidebar',
    ]);
    expect(mergeExcludeSelectors([], undefined)).toEqual([]);
    expect(mergeExcludeSelectors(['PRE'], ['pre'])).toEqual(['PRE', 'pre']);

    // FR-28: most-specific hostname match wins
    const specificRules: SiteRule[] = [
      makeSiteRule({ id: 'broad', hostname: '*.example.com' }),
      makeSiteRule({ id: 'exact', hostname: 'docs.example.com' }),
      makeSiteRule({ id: 'mid', hostname: '*.docs.example.com' }),
    ];
    expect(findMatchingRule('docs.example.com', specificRules)?.id).toBe('exact');
    expect(findMatchingRule('api.docs.example.com', specificRules)?.id).toBe('mid');
    expect(findMatchingRule('www.example.com', specificRules)?.id).toBe('broad');
  });
});
