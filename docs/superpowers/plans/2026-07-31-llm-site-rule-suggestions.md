# LLM Site Rule Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users paste a page URL in Settings → Site Rules Add/Edit form, capture page structure (open tab preferred, else load URL), draft a full site rule via the translation LLM (heuristics fallback), and apply it into the form for review before save.

**Architecture:** Pure libs build a capped DOM outline, heuristic draft, prompt, and selector sanitize. Background handles `SUGGEST_SITE_RULE`: hybrid capture → heuristic → optional LLM refine via existing `translate({ preScanSystemPrompt, customUserPrompt, returnRawResponse: true })` → validated draft. Content script answers `GET_DOM_OUTLINE`. Options `RuleEditForm` owns URL UI, loading/error, and draft merge. No settings schema migration.

**Tech Stack:** TypeScript, Vitest, React (Options), Chrome extension messaging (WXT), existing OpenAI-compatible provider pool via `initService().translate()`.

**Spec:** `docs/superpowers/specs/2026-07-31-llm-site-rule-suggestions-design.md`

## Global Constraints

- Full rule draft only; never auto-save — user must click Add rule / Save changes
- Hybrid capture: open tab preferred; fallback loads URL when no matching tab
- Reuse translation provider (same pool as translate); no separate assistant model
- Heuristic draft when provider missing or LLM fails (`warnings` includes `heuristic_only`)
- `source` is capture path only: `'tab' | 'fetch'`
- http(s) URLs only; outline hard-capped; no persistence of page content beyond the request
- Sanitize all LLM selectors before returning
- Do not change runtime site-rule matching engine
- TDD: failing test → implement → pass → commit per task
- Keep `SiteRulesSection.tsx` growth limited: put pure logic in `lib/siteRuleSuggest/`

## File map

| File | Responsibility |
|------|----------------|
| `lib/siteRuleSuggest/types.ts` | Shared outline/draft/result types (pure) |
| `lib/siteRuleSuggest/url.ts` | Parse/normalize URL, hostname pattern helpers |
| `lib/siteRuleSuggest/outline.ts` | Build outline from `Document` (jsdom + real DOM) |
| `lib/siteRuleSuggest/heuristics.ts` | Outline → draft without LLM |
| `lib/siteRuleSuggest/sanitize.ts` | Validate/dedupe/cap selectors + draft |
| `lib/siteRuleSuggest/prompt.ts` | System/user prompts + JSON parse of LLM output |
| `lib/siteRuleSuggest/index.ts` | Barrel exports |
| `types/messages.ts` | `SUGGEST_SITE_RULE`, `GET_DOM_OUTLINE` (+ results) on unions |
| `wxt.config.ts` | Add `tabs` permission (read tab URLs; temp-tab fallback) |
| `entrypoints/content.ts` | Handle `GET_DOM_OUTLINE` |
| `services/background.ts` | Orchestrator + `handleMessage` case |
| `entrypoints/options/sections/SiteRulesSection.tsx` | Suggest UI strip + draft merge in `RuleEditForm` |
| `lib/__tests__/siteRuleSuggest.*.test.ts` | Unit tests |
| `entrypoints/options/sections/__tests__/SiteRulesSection.suggest.test.tsx` | UI merge/states |
| `services/__tests__/background.suggestSiteRule.test.ts` | Handler orchestration mocks |

## Permissions note (implementation reality)

Manifest today has no `tabs` and only narrow `host_permissions`. Direct SW `fetch(arbitraryUrl)` will often fail.

**v1 capture strategy (implements hybrid intent):**

1. **`tab`:** `chrome.tabs.query` → hostname match → `tabs.sendMessage({ action: 'GET_DOM_OUTLINE' })`.
2. **`fetch` fallback (in order):**
   - a. Try SW `fetch(url)` + `DOMParser`/`linkedom`-free parse via `new DOMParser` in background is unavailable in SW — use regex-light HTML → outline helper that accepts HTML string via `parseHtmlToOutline` implemented with a minimal HTML parse in tests via jsdom, and in SW via creating outline from fetched text using the same pure function tested with jsdom **OR** skip raw fetch and go straight to (b).
   - b. **Reliable path:** open inactive temp tab → wait `status === 'complete'` (+ short settle 500ms) → `GET_DOM_OUTLINE` → always close tab in `finally`. Report `source: 'fetch'` and warning `loaded_in_temp_tab` when (b) used; if raw fetch worked, warning omitted or `fetched_html`.

**Plan choice (lock in):** Prefer **temp tab** as the primary no-open-tab fallback (accurate JS DOM, no new host_permissions). Optionally attempt raw `fetch` first only if cheap; if unimplemented in first slice, temp-tab-only fallback is acceptable and must be documented in UI copy (“Loading page in background…”).

Add `"tabs"` to `manifest.permissions` in `wxt.config.ts`.

---

### Task 1: Types + URL helpers

**Files:**
- Create: `lib/siteRuleSuggest/types.ts`
- Create: `lib/siteRuleSuggest/url.ts`
- Create: `lib/siteRuleSuggest/index.ts`
- Test: `lib/__tests__/siteRuleSuggest.url.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export interface DomOutlineNode {
    tag: string;
    id?: string;
    classes?: string[];
    role?: string;
    textSample?: string;
    textLength: number;
    depth: number;
  }

  export interface DomOutline {
    url: string;
    hostname: string;
    title: string;
    nodes: DomOutlineNode[];
  }

  export type SiteRuleSuggestSource = 'tab' | 'fetch';

  export interface SuggestSiteRuleDraft {
    hostname: string;
    includeSelectors: string[];
    excludeSelectors: string[];
    alwaysTranslate?: boolean;
    neverTranslate?: boolean;
    category?: string;
    source: SiteRuleSuggestSource;
    warnings?: string[];
    rationale?: string;
  }

  // url.ts
  export function parseSuggestUrl(input: string): { ok: true; url: URL } | { ok: false; error: string };
  export function hostnameFromUrl(url: URL): string;
  export function preferHostnamePattern(hostname: string, title?: string): string;
  export function tabUrlMatchesHostname(tabUrl: string | undefined, hostname: string): boolean;
  ```

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/siteRuleSuggest.url.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  parseSuggestUrl,
  hostnameFromUrl,
  preferHostnamePattern,
  tabUrlMatchesHostname,
} from '@/lib/siteRuleSuggest/url';

describe('parseSuggestUrl', () => {
  it('accepts https URLs and normalizes', () => {
    const r = parseSuggestUrl('https://www.Example.com/path?q=1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url.protocol).toBe('https:');
      expect(r.url.hostname).toBe('www.example.com');
    }
  });

  it('rejects non-http(s)', () => {
    expect(parseSuggestUrl('javascript:alert(1)').ok).toBe(false);
    expect(parseSuggestUrl('file:///tmp/x').ok).toBe(false);
    expect(parseSuggestUrl('not a url').ok).toBe(false);
  });

  it('adds https when scheme missing but host-like', () => {
    const r = parseSuggestUrl('example.com/foo');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url.protocol).toBe('https:');
  });
});

describe('hostname helpers', () => {
  it('strips leading www. for pattern preference on simple hosts', () => {
    const url = new URL('https://www.example.com/a');
    expect(hostnameFromUrl(url)).toBe('www.example.com');
    expect(preferHostnamePattern('www.example.com')).toBe('example.com');
  });

  it('uses wildcard for multi-part subdomains when depth > 2 labels beyond public-ish host', () => {
    // v1 simple rule: if hostname has ≥3 labels and does not start with www., suggest *.parent.tld
    // e.g. docs.example.com → *.example.com; a.b.example.com → *.example.com (last 2 labels + star)
    expect(preferHostnamePattern('docs.example.com')).toBe('*.example.com');
    expect(preferHostnamePattern('example.com')).toBe('example.com');
  });

  it('matches tab URLs by hostname ignoring www', () => {
    expect(tabUrlMatchesHostname('https://www.example.com/x', 'example.com')).toBe(true);
    expect(tabUrlMatchesHostname('https://other.com', 'example.com')).toBe(false);
    expect(tabUrlMatchesHostname(undefined, 'example.com')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/siteRuleSuggest.url.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Minimal implementation**

`lib/siteRuleSuggest/types.ts` — types exactly as in Interfaces.

`lib/siteRuleSuggest/url.ts`:

```ts
export function parseSuggestUrl(input: string): { ok: true; url: URL } | { ok: false; error: string } {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Enter a URL' };
  let candidate = raw;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http(s) URLs are supported' };
  }
  if (!url.hostname) return { ok: false, error: 'Invalid URL' };
  return { ok: true, url };
}

export function hostnameFromUrl(url: URL): string {
  return url.hostname.toLowerCase();
}

function stripWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

/** v1: www.x → x; a.b.tld (3+ labels, not only www) → *.parent.tld (last two labels). */
export function preferHostnamePattern(hostname: string): string {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  const noWww = stripWww(h);
  const parts = noWww.split('.').filter(Boolean);
  if (parts.length >= 3) {
    return `*.${parts.slice(-2).join('.')}`;
  }
  return noWww;
}

export function tabUrlMatchesHostname(tabUrl: string | undefined, hostname: string): boolean {
  if (!tabUrl) return false;
  try {
    const tabHost = stripWww(new URL(tabUrl).hostname.toLowerCase());
    const target = stripWww(hostname.toLowerCase());
    return tabHost === target || tabHost.endsWith(`.${target}`);
  } catch {
    return false;
  }
}
```

`lib/siteRuleSuggest/index.ts` — re-export types + url.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/siteRuleSuggest.url.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/siteRuleSuggest/types.ts lib/siteRuleSuggest/url.ts lib/siteRuleSuggest/index.ts lib/__tests__/siteRuleSuggest.url.test.ts
git commit -m "feat(site-rules): add URL helpers for AI rule suggestions"
```

---

### Task 2: DOM outline builder

**Files:**
- Create: `lib/siteRuleSuggest/outline.ts`
- Modify: `lib/siteRuleSuggest/index.ts`
- Test: `lib/__tests__/siteRuleSuggest.outline.test.ts`

**Interfaces:**
- Consumes: `DomOutline`, `DomOutlineNode` from `./types`
- Produces:
  ```ts
  export const OUTLINE_MAX_NODES = 40;
  export const OUTLINE_MAX_CLASSES = 5;
  export const OUTLINE_TEXT_SAMPLE = 80;

  export function buildDomOutline(
    doc: Document,
    meta: { url: string; hostname: string },
  ): DomOutline;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildDomOutline, OUTLINE_MAX_NODES } from '@/lib/siteRuleSuggest/outline';

function dom(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('buildDomOutline', () => {
  it('captures title and content-ish nodes with caps', () => {
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
    expect(tags).toEqual(expect.arrayContaining(['nav', 'main', 'article', 'aside', 'footer', 'pre']));
    const article = outline.nodes.find((n) => n.tag === 'article');
    expect(article?.id).toBeUndefined();
    expect(article?.classes?.length).toBeGreaterThan(0);
    expect((article?.textSample ?? '').length).toBeLessThanOrEqual(80);
  });

  it('skips script/style and empty noise', () => {
    const doc = dom(`<html><body><script>alert(1)</script><style>x{}</style><div></div><p>Hi there friend</p></body></html>`);
    const outline = buildDomOutline(doc, { url: 'https://x.test', hostname: 'x.test' });
    expect(outline.nodes.every((n) => n.tag !== 'script' && n.tag !== 'style')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/siteRuleSuggest.outline.test.ts`

Expected: FAIL

- [ ] **Step 3: Minimal implementation**

Implement `buildDomOutline`:

- Read `doc.title`
- Query candidates: `main, article, [role="main"], nav, aside, footer, header, pre, code, section, .sidebar, .content, .post, [role="navigation"], [role="complementary"]` plus largest text-ish blocks via walking `p, h1, h2, h3, li` parents — keep simple: fixed selector list first, then walk `body *` depth-limited and score by `textContent.length`, take top remaining until cap
- Skip `script, style, noscript, svg, path`
- For each node: tagName lower, id if ≤64 chars and safe `/^[a-zA-Z][\w-]*$/`, up to 5 class tokens matching `/^[a-zA-Z_][\w-]*$/` (drop hashed-looking classes with long random suffixes optionally later — v1 drop classes with length > 40 or containing only hex-like)
- `textSample`: collapse whitespace, slice 80
- `textLength`: full text length capped reporting at e.g. min(real, 100000)
- `depth`: count parents to body
- Sort: prefer semantic content tags first, then by textLength desc
- Slice to `OUTLINE_MAX_NODES`

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run lib/__tests__/siteRuleSuggest.outline.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/siteRuleSuggest/outline.ts lib/siteRuleSuggest/index.ts lib/__tests__/siteRuleSuggest.outline.test.ts
git commit -m "feat(site-rules): build capped DOM outline for rule suggestions"
```

---

### Task 3: Heuristics + sanitize

**Files:**
- Create: `lib/siteRuleSuggest/heuristics.ts`
- Create: `lib/siteRuleSuggest/sanitize.ts`
- Modify: `lib/siteRuleSuggest/index.ts`
- Test: `lib/__tests__/siteRuleSuggest.heuristics.test.ts`
- Test: `lib/__tests__/siteRuleSuggest.sanitize.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function heuristicDraftFromOutline(
    outline: DomOutline,
    source: SiteRuleSuggestSource,
    extraWarnings?: string[],
  ): SuggestSiteRuleDraft;

  export function sanitizeSelector(sel: string): string | null;
  export function sanitizeSelectorList(list: unknown, max?: number): string[];
  export function sanitizeDraft(
    raw: Partial<SuggestSiteRuleDraft> & Record<string, unknown>,
    fallback: SuggestSiteRuleDraft,
  ): SuggestSiteRuleDraft;
  ```

- [ ] **Step 1: Write failing tests**

`heuristics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { heuristicDraftFromOutline } from '@/lib/siteRuleSuggest/heuristics';
import type { DomOutline } from '@/lib/siteRuleSuggest/types';

const outline: DomOutline = {
  url: 'https://docs.example.com/page',
  hostname: 'docs.example.com',
  title: 'Docs',
  nodes: [
    { tag: 'nav', classes: ['nav'], textLength: 20, depth: 1, textSample: 'Home' },
    { tag: 'article', id: 'post', classes: ['post'], textLength: 2000, depth: 2, textSample: 'Hello' },
    { tag: 'aside', classes: ['sidebar'], textLength: 100, depth: 2, textSample: 'Ads' },
    { tag: 'pre', classes: ['highlight'], textLength: 500, depth: 3, textSample: 'code' },
  ],
};

describe('heuristicDraftFromOutline', () => {
  it('builds include/exclude selectors and hostname pattern', () => {
    const d = heuristicDraftFromOutline(outline, 'tab');
    expect(d.source).toBe('tab');
    expect(d.hostname).toBe('*.example.com');
    expect(d.includeSelectors.some((s) => s.includes('article') || s.includes('#post'))).toBe(true);
    expect(d.excludeSelectors.some((s) => s.includes('nav') || s.includes('sidebar') || s.includes('pre'))).toBe(true);
    expect(d.warnings).toEqual(expect.arrayContaining(['heuristic_only']));
  });
});
```

`sanitize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sanitizeSelector, sanitizeSelectorList, sanitizeDraft } from '@/lib/siteRuleSuggest/sanitize';
import type { SuggestSiteRuleDraft } from '@/lib/siteRuleSuggest/types';

const base: SuggestSiteRuleDraft = {
  hostname: 'example.com',
  includeSelectors: ['main'],
  excludeSelectors: ['nav'],
  source: 'tab',
};

describe('sanitizeSelector', () => {
  it('keeps simple selectors and drops junk', () => {
    expect(sanitizeSelector(' article.post ')).toBe('article.post');
    expect(sanitizeSelector('')).toBeNull();
    expect(sanitizeSelector('a'.repeat(300))).toBeNull();
    expect(sanitizeSelector('div > script')).toBeNull();
    expect(sanitizeSelector('p:has(script)')).toBeNull();
  });
});

describe('sanitizeDraft', () => {
  it('falls back fields and merges warnings', () => {
    const d = sanitizeDraft(
      {
        hostname: '*.Evil.com.',
        includeSelectors: ['main', 'main', ''],
        excludeSelectors: ['nav', 'javascript:x'],
        source: 'fetch',
        alwaysTranslate: true,
        neverTranslate: true, // invalid combo → clear both or prefer never; v1: clear both to default
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
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm exec vitest run lib/__tests__/siteRuleSuggest.heuristics.test.ts lib/__tests__/siteRuleSuggest.sanitize.test.ts`

- [ ] **Step 3: Implement**

**heuristics:** Map nodes → selectors:

- Prefer `#id` when present, else `tag.class` (first 1–2 stable classes), else `tag`
- Includes: from `main|article|section` or role=main or largest text nodes (max 8)
- Excludes: `nav|aside|footer|header|pre|code` and sidebar-like classes (max 8)
- hostname via `preferHostnamePattern(outline.hostname)`
- Always set `warnings: ['heuristic_only', ...(extraWarnings??[])]`
- Do not set always/never

**sanitize:**

- `sanitizeSelector`: trim; max 200 chars; reject if empty; reject if matches `/script|javascript:|expression\(|@import/i` or unbalanced brackets; allow CSS selector charset `[\w\s\-.#:[\]()="'*>+~,|]+` roughly
- lists: map sanitize, filter null, dedupe, max 20 default
- hostname: lower, strip trailing `.`, must match `/^(\*\.)?([a-z0-9-]+\.)+[a-z]{2,}$/` or single label host for localhost tests — if invalid use fallback.hostname
- always+never both true → both false
- rationale: string slice 300
- preserve source from raw if tab|fetch else fallback.source

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/siteRuleSuggest/heuristics.ts lib/siteRuleSuggest/sanitize.ts lib/siteRuleSuggest/index.ts lib/__tests__/siteRuleSuggest.heuristics.test.ts lib/__tests__/siteRuleSuggest.sanitize.test.ts
git commit -m "feat(site-rules): heuristic drafts and selector sanitization"
```

---

### Task 4: LLM prompt + JSON parse

**Files:**
- Create: `lib/siteRuleSuggest/prompt.ts`
- Modify: `lib/siteRuleSuggest/index.ts`
- Test: `lib/__tests__/siteRuleSuggest.prompt.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function buildSiteRuleSuggestSystemPrompt(): string;
  export function buildSiteRuleSuggestUserPrompt(outline: DomOutline): string;
  export function parseSiteRuleSuggestLlmJson(raw: string): Partial<SuggestSiteRuleDraft> | null;
  ```

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  buildSiteRuleSuggestSystemPrompt,
  buildSiteRuleSuggestUserPrompt,
  parseSiteRuleSuggestLlmJson,
} from '@/lib/siteRuleSuggest/prompt';
import type { DomOutline } from '@/lib/siteRuleSuggest/types';

const outline: DomOutline = {
  url: 'https://example.com',
  hostname: 'example.com',
  title: 'T',
  nodes: [{ tag: 'main', textLength: 100, depth: 1, textSample: 'Hi' }],
};

describe('site rule suggest prompts', () => {
  it('asks for JSON only with required keys', () => {
    const s = buildSiteRuleSuggestSystemPrompt();
    expect(s.toLowerCase()).toContain('json');
    expect(s).toContain('includeSelectors');
    expect(s).toContain('excludeSelectors');
    expect(s).toContain('hostname');
  });

  it('embeds outline compactly', () => {
    const u = buildSiteRuleSuggestUserPrompt(outline);
    expect(u).toContain('example.com');
    expect(u).toContain('main');
  });
});

describe('parseSiteRuleSuggestLlmJson', () => {
  it('parses pure JSON', () => {
    const p = parseSiteRuleSuggestLlmJson(
      '{"hostname":"example.com","includeSelectors":["main"],"excludeSelectors":["nav"],"rationale":"main content"}',
    );
    expect(p?.hostname).toBe('example.com');
    expect(p?.includeSelectors).toEqual(['main']);
  });

  it('parses fenced JSON and rejects garbage', () => {
    expect(parseSiteRuleSuggestLlmJson('```json\n{"hostname":"a.com","includeSelectors":["main"],"excludeSelectors":[]}\n```')?.hostname).toBe('a.com');
    expect(parseSiteRuleSuggestLlmJson('sorry')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

System prompt requirements (verbatim intent):

- You help configure a browser translation extension site rule
- Return ONLY JSON object keys: hostname, includeSelectors, excludeSelectors, optional alwaysTranslate, neverTranslate, category, rationale
- Prefer stable semantic selectors; avoid ephemeral hashed classes
- include = main readable content; exclude = chrome/nav/code
- hostname exact or `*.domain.tld`
- No markdown

User prompt: URL, title, hostname, JSON-stringified nodes (already capped)

Parse: trim; strip ```json fences; `JSON.parse`; must be object; return partial fields only

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/siteRuleSuggest/prompt.ts lib/siteRuleSuggest/index.ts lib/__tests__/siteRuleSuggest.prompt.test.ts
git commit -m "feat(site-rules): LLM prompt and JSON parse for rule suggestions"
```

---

### Task 5: Message types + `tabs` permission

**Files:**
- Modify: `types/messages.ts` (`MessageAction`, message interfaces, `ExtensionMessage` union)
- Modify: `wxt.config.ts` (`permissions` add `tabs`)
- Test: `types/__tests__/suggestSiteRuleMessages.test.ts` (type-level runtime shape smoke via satisfies or simple expect on action string constants if you export them — prefer a tiny runtime test file that imports types only through a const object)

**Interfaces:**
- Produces:
  ```ts
  // MessageAction adds:
  // 'SUGGEST_SITE_RULE' | 'GET_DOM_OUTLINE'

  export interface SuggestSiteRuleMessage {
    action: 'SUGGEST_SITE_RULE';
    url: string;
  }

  export interface SuggestSiteRuleResult {
    success: boolean;
    draft?: import('@/lib/siteRuleSuggest/types').SuggestSiteRuleDraft;
    error?: string;
  }

  export interface GetDomOutlineMessage {
    action: 'GET_DOM_OUTLINE';
  }

  export interface GetDomOutlineResult {
    success: boolean;
    outline?: import('@/lib/siteRuleSuggest/types').DomOutline;
    error?: string;
  }
  ```

- [ ] **Step 1: Write failing smoke test**

```ts
import { describe, it, expectTypeOf } from 'vitest';
// If expectTypeOf unavailable, use:
import { describe, it, expect } from 'vitest';
import type { SuggestSiteRuleMessage, SuggestSiteRuleResult, ExtensionMessage } from '@/types/messages';

describe('SUGGEST_SITE_RULE messages', () => {
  it('message shape', () => {
    const msg: SuggestSiteRuleMessage = { action: 'SUGGEST_SITE_RULE', url: 'https://example.com' };
    expect(msg.action).toBe('SUGGEST_SITE_RULE');
    const _union: ExtensionMessage = msg;
    expect(_union.action).toBe('SUGGEST_SITE_RULE');
  });
});
```

- [ ] **Step 2: Run — FAIL (types missing)**

- [ ] **Step 3: Add to `types/messages.ts`**

1. Extend `MessageAction` with `'SUGGEST_SITE_RULE' | 'GET_DOM_OUTLINE'`
2. Add interfaces above (import type `SuggestSiteRuleDraft` / `DomOutline` from lib OR duplicate minimal inline — prefer import type from lib)
3. Add to `ExtensionMessage` union: `SuggestSiteRuleMessage | GetDomOutlineMessage`

Note: content-script-only messages sometimes stay off the background union; include both so TS sendMessage helpers stay consistent. If `ExtensionMessage` is background-centric, still add `SUGGEST_SITE_RULE` there; `GET_DOM_OUTLINE` may be used only tab→content — still export the interface.

`wxt.config.ts` permissions:

```ts
permissions: ['storage', 'activeTab', 'contextMenus', 'sidePanel', 'alarms', 'tabs'],
```

- [ ] **Step 4: Run test + `pnpm exec tsc --noEmit`** (or project compile) if quick

- [ ] **Step 5: Commit**

```bash
git add types/messages.ts wxt.config.ts types/__tests__/suggestSiteRuleMessages.test.ts
git commit -m "feat(site-rules): message types and tabs permission for AI suggest"
```

---

### Task 6: Content script `GET_DOM_OUTLINE`

**Files:**
- Modify: `entrypoints/content.ts` (`setupMessageListener`)
- Test: prefer extracting pure call — if content listener is hard to unit test, add `content/utils/getDomOutline.ts` thin wrapper and test that; listener just calls it

**Interfaces:**
- Produces: content handler returns `GetDomOutlineResult`

- [ ] **Step 1: Write test for wrapper**

Create `content/utils/getDomOutline.ts` + `content/__tests__/getDomOutline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getDomOutlineFromDocument } from '@/content/utils/getDomOutline';

describe('getDomOutlineFromDocument', () => {
  it('returns outline for current-like document', () => {
    const html = `<!doctype html><html><head><title>T</title></head><body><main><p>${'hi '.repeat(30)}</p></main></body></html>`;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const r = getDomOutlineFromDocument(doc, 'https://example.com/page');
    expect(r.success).toBe(true);
    expect(r.outline?.title).toBe('T');
    expect(r.outline?.hostname).toBe('example.com');
  });
});
```

- [ ] **Step 2: FAIL then implement wrapper**

```ts
import { buildDomOutline } from '@/lib/siteRuleSuggest/outline';
import type { GetDomOutlineResult } from '@/types/messages';

export function getDomOutlineFromDocument(doc: Document, href: string): GetDomOutlineResult {
  try {
    const url = new URL(href);
    const outline = buildDomOutline(doc, {
      url: href,
      hostname: url.hostname.toLowerCase(),
    });
    return { success: true, outline };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
```

- [ ] **Step 3: Wire listener in `setupMessageListener`**

```ts
} else if (message.action === 'GET_DOM_OUTLINE') {
  const result = getDomOutlineFromDocument(document, location.href);
  sendResponse(result);
  return false;
}
```

Import `getDomOutlineFromDocument` at top of content.ts.

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git add content/utils/getDomOutline.ts content/__tests__/getDomOutline.test.ts entrypoints/content.ts
git commit -m "feat(site-rules): content script DOM outline for AI suggest"
```

---

### Task 7: Background orchestrator `SUGGEST_SITE_RULE`

**Files:**
- Modify: `services/background.ts` (handler + switch case)
- Create: `services/__tests__/background.suggestSiteRule.test.ts`
- Optional extract: `lib/siteRuleSuggest/orchestrate.ts` pure core for easier tests — **recommended**

**Interfaces:**
- Produces:
  ```ts
  // lib/siteRuleSuggest/orchestrate.ts
  export async function buildSuggestSiteRuleDraft(deps: {
    urlInput: string;
    findOpenTabOutline: (hostname: string, pageUrl: URL) => Promise<DomOutline | null>;
    loadUrlOutline: (pageUrl: URL) => Promise<{ outline: DomOutline; warnings: string[] }>;
    runLlm: (outline: DomOutline) => Promise<string | null>; // raw model text or null if skip
  }): Promise<SuggestSiteRuleResult>;
  ```

  Background wires chrome APIs + `initService().translate`.

- [ ] **Step 1: Failing unit tests for orchestrate (no chrome)**

```ts
import { describe, it, expect, vi } from 'vitest';
import { buildSuggestSiteRuleDraft } from '@/lib/siteRuleSuggest/orchestrate';
import type { DomOutline } from '@/lib/siteRuleSuggest/types';

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
        outline: { ...sampleOutline, hostname: 'docs.example.com', url: 'https://docs.example.com/x' },
        warnings: ['loaded_in_temp_tab'],
      }),
      runLlm: async () => null,
    });
    expect(r.success).toBe(true);
    expect(r.draft?.source).toBe('fetch');
    expect(r.draft?.warnings).toEqual(expect.arrayContaining(['heuristic_only', 'loaded_in_temp_tab']));
  });

  it('errors on bad URL', async () => {
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
  });

  it('errors when capture fails', async () => {
    const r = await buildSuggestSiteRuleDraft({
      urlInput: 'https://example.com',
      findOpenTabOutline: async () => null,
      loadUrlOutline: async () => {
        throw new Error('net fail');
      },
      runLlm: async () => null,
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: FAIL then implement `orchestrate.ts`**

Logic:

1. `parseSuggestUrl` — fail → `{ success:false, error }`
2. `outline = await findOpenTabOutline(hostname, url)` → source tab
3. else `loaded = await loadUrlOutline(url)` → source fetch, collect warnings
4. `base = heuristicDraftFromOutline(outline, source, warnings)`
5. `raw = await runLlm(outline)` — if null → return `{ success:true, draft: base }`
6. `parsed = parseSiteRuleSuggestLlmJson(raw)` — if null → base
7. `draft = sanitizeDraft({ ...parsed, source, warnings: without forcing heuristic_only }, base)`  
   - If LLM path succeeded with ≥1 include or exclude after sanitize, **remove** `heuristic_only` from warnings  
   - If LLM produced nothing useful, keep heuristic selectors + `heuristic_only`
8. Return `{ success:true, draft }`

- [ ] **Step 3: Wire background**

In `services/background.ts`:

```ts
async function handleSuggestSiteRule(
  message: SuggestSiteRuleMessage,
): Promise<SuggestSiteRuleResult> {
  return buildSuggestSiteRuleDraft({
    urlInput: message.url,
    findOpenTabOutline: async (hostname) => {
      const tabs = await chrome.tabs.query({});
      const matches = tabs.filter((t) => tabUrlMatchesHostname(t.url, hostname) && t.id != null);
      // prefer active tab
      matches.sort((a, b) => Number(b.active) - Number(a.active));
      for (const tab of matches) {
        try {
          const res = (await chrome.tabs.sendMessage(tab.id!, {
            action: 'GET_DOM_OUTLINE',
          })) as GetDomOutlineResult;
          if (res?.success && res.outline) return res.outline;
        } catch {
          /* try next */
        }
      }
      return null;
    },
    loadUrlOutline: async (pageUrl) => {
      const tab = await chrome.tabs.create({ url: pageUrl.toString(), active: false });
      try {
        const tabId = tab.id;
        if (tabId == null) throw new Error('Could not open page');
        await waitForTabComplete(tabId, 15000);
        await new Promise((r) => setTimeout(r, 500));
        const res = (await chrome.tabs.sendMessage(tabId, {
          action: 'GET_DOM_OUTLINE',
        })) as GetDomOutlineResult;
        if (!res?.success || !res.outline) {
          throw new Error(res?.error ?? 'Could not read page structure');
        }
        return { outline: res.outline, warnings: ['loaded_in_temp_tab'] };
      } finally {
        if (tab.id != null) {
          try {
            await chrome.tabs.remove(tab.id);
          } catch {
            /* ignore */
          }
        }
      }
    },
    runLlm: async (outline) => {
      try {
        const service = await initService();
        const result = await service.translate({
          texts: new Map([['suggest', 'site-rule']]),
          sourceLanguage: 'auto',
          targetLanguage: 'en',
          preScanSystemPrompt: buildSiteRuleSuggestSystemPrompt(),
          customUserPrompt: buildSiteRuleSuggestUserPrompt(outline),
          returnRawResponse: true,
        });
        if (!result.success) return null;
        return result.translations.get('suggest') ?? null;
      } catch {
        return null;
      }
    },
  });
}
```

Add small helper `waitForTabComplete` in background file or `lib/siteRuleSuggest/waitTab.ts` using `chrome.tabs.onUpdated` + timeout.

Switch case:

```ts
case 'SUGGEST_SITE_RULE':
  return handleSuggestSiteRule(message as SuggestSiteRuleMessage);
```

Import message types + lib helpers.

- [ ] **Step 4: Run orchestrate tests PASS**

Run: `pnpm exec vitest run lib/__tests__/siteRuleSuggest.orchestrate.test.ts`

Optional: light mock test for handler if pattern exists in `services/__tests__/background.translate.test.ts` — only if low cost.

- [ ] **Step 5: Commit**

```bash
git add lib/siteRuleSuggest/orchestrate.ts lib/__tests__/siteRuleSuggest.orchestrate.test.ts services/background.ts
git commit -m "feat(site-rules): background SUGGEST_SITE_RULE orchestration"
```

---

### Task 8: Options UI — Suggest from URL in `RuleEditForm`

**Files:**
- Modify: `entrypoints/options/sections/SiteRulesSection.tsx` (`RuleEditForm`)
- Test: `entrypoints/options/sections/__tests__/SiteRulesSection.suggest.test.tsx`

**Interfaces:**
- Consumes: `SuggestSiteRuleResult` via `chrome.runtime.sendMessage`
- Produces: draft merge into form state (no save)

**Merge rules (implement exactly):**

```ts
function mergeSuggestDraft(
  form: FormState,
  draft: SuggestSiteRuleDraft,
  isNew: boolean,
): FormState {
  return {
    ...form,
    hostname: isNew || !form.hostname.trim() ? draft.hostname : form.hostname,
    includeSelectors: [...draft.includeSelectors],
    excludeSelectors: [...draft.excludeSelectors],
    alwaysTranslate:
      getMode(form) === 'default' && draft.alwaysTranslate
        ? true
        : form.alwaysTranslate,
    neverTranslate:
      getMode(form) === 'default' && draft.neverTranslate
        ? true
        : form.neverTranslate,
    categoryValue:
      form.categoryValue === '__none__' && draft.category
        ? draft.category
        : form.categoryValue,
  };
}
```

- [ ] **Step 1: Extract pure merge to testable helper**

Create `lib/siteRuleSuggest/mergeForm.ts` + tests (or keep function in test file importing from section — prefer lib):

```ts
export function mergeSuggestDraftIntoRuleForm(
  form: {
    hostname: string;
    includeSelectors: string[];
    excludeSelectors: string[];
    alwaysTranslate: boolean;
    neverTranslate: boolean;
    categoryValue: string;
  },
  draft: SuggestSiteRuleDraft,
  isNew: boolean,
): typeof form;
```

Test Add overwrites hostname; Edit keeps hostname when set; selectors replace; mode only from default; category only from `__none__`.

- [ ] **Step 2: FAIL then implement merge helper — PASS — commit**

```bash
git add lib/siteRuleSuggest/mergeForm.ts lib/__tests__/siteRuleSuggest.mergeForm.test.ts lib/siteRuleSuggest/index.ts
git commit -m "feat(site-rules): merge AI draft into rule form state"
```

- [ ] **Step 3: UI in `RuleEditForm`**

State:

```ts
const [suggestUrl, setSuggestUrl] = useState('');
const [suggestStatus, setSuggestStatus] = useState<
  'idle' | 'loading' | 'success' | 'error'
>('idle');
const [suggestMessage, setSuggestMessage] = useState<string | null>(null);
const [suggestRationale, setSuggestRationale] = useState<string | null>(null);
```

UI block **above** step 1 Match (inside the padded form area):

```tsx
<section className="space-y-2 rounded-lg border border-teal-500/15 bg-teal-500/[0.04] p-3">
  <div className="flex items-center gap-2">
    <Sparkles className="h-3.5 w-3.5 text-teal-400" />
    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
      Suggest from URL
    </h4>
  </div>
  <p className="text-[11px] text-zinc-500">
    Uses your translation provider. Prefer having the page open in a tab for better selectors.
  </p>
  <div className="flex flex-col gap-2 sm:flex-row">
    <Input
      id="rule-suggest-url"
      type="url"
      placeholder="https://example.com/article"
      value={suggestUrl}
      onChange={(e) => setSuggestUrl(e.target.value)}
      disabled={suggestStatus === 'loading'}
      className="flex-1 font-mono text-sm"
    />
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={suggestStatus === 'loading' || !suggestUrl.trim()}
      onClick={() => void handleSuggest()}
      icon={<Sparkles className="h-3.5 w-3.5" />}
    >
      {suggestStatus === 'loading' ? 'Analyzing…' : 'Suggest with AI'}
    </Button>
  </div>
  {suggestMessage && (
    <p
      className={
        suggestStatus === 'error'
          ? 'text-[11px] text-rose-400'
          : 'text-[11px] text-teal-300/90'
      }
      role={suggestStatus === 'error' ? 'alert' : 'status'}
    >
      {suggestMessage}
    </p>
  )}
  {suggestRationale && suggestStatus === 'success' && (
    <p className="text-[11px] text-zinc-500">{suggestRationale}</p>
  )}
</section>
```

`handleSuggest`:

```ts
const handleSuggest = async () => {
  setSuggestStatus('loading');
  setSuggestMessage('Analyzing page…');
  setSuggestRationale(null);
  try {
    const result = (await chrome.runtime.sendMessage({
      action: 'SUGGEST_SITE_RULE',
      url: suggestUrl.trim(),
    })) as SuggestSiteRuleResult;

    if (!result?.success || !result.draft) {
      setSuggestStatus('error');
      setSuggestMessage(result?.error ?? 'Could not suggest a rule');
      return;
    }
    const d = result.draft;
    setForm((prev) => ({
      ...prev,
      ...mergeSuggestDraftIntoRuleForm(prev, d, isNew),
    }));
    setSuggestStatus('success');
    const bits: string[] = [];
    if (d.source === 'tab') bits.push('Using open tab');
    else if (d.warnings?.includes('loaded_in_temp_tab'))
      bits.push('Loaded page in background (may differ from logged-in view)');
    else bits.push('Fetched URL (may miss dynamic content)');
    if (d.warnings?.includes('heuristic_only'))
      bits.push('Basic draft (LLM unavailable)');
    bits.push('Draft applied — review before save');
    setSuggestMessage(bits.join(' · '));
    setSuggestRationale(d.rationale ?? null);
  } catch (e) {
    setSuggestStatus('error');
    setSuggestMessage(e instanceof Error ? e.message : 'Could not suggest a rule');
  }
};
```

Ensure `form` state shape includes fields merge expects; when spreading merge result, keep `customCategory` etc.

- [ ] **Step 4: Component test with mocked `chrome.runtime.sendMessage`**

Follow existing options test patterns (`DictionarySection.test.tsx`): render `SiteRulesSection` or export `RuleEditForm` if needed. Minimal path:

- Mock settings store with empty siteRules
- Click Add rule
- Fill suggest URL
- Mock message success draft
- Assert hostname input value and include chip appear
- Assert Save still required (rule not in store until save)

If full section test is heavy, unit-test merge (done) + a thin test file that mounts only form by exporting `RuleEditForm` for tests — **allowed**: `export { RuleEditForm }` or test-id queries on section.

- [ ] **Step 5: Run UI tests PASS**

- [ ] **Step 6: Commit**

```bash
git add entrypoints/options/sections/SiteRulesSection.tsx entrypoints/options/sections/__tests__/SiteRulesSection.suggest.test.tsx
git commit -m "feat(site-rules): Suggest from URL UI in rule editor"
```

---

### Task 9: Integration polish + quality gates

**Files:**
- Modify as needed from gaps found
- Possibly short helper text on per-site rules zone description

- [ ] **Step 1: Manual checklist (document in commit body; run what you can)**

1. Options → Site Rules → Add rule → paste URL of currently open tab → Suggest → draft fills → Save → rule listed  
2. Close that site’s tab → Suggest with same URL → temp tab path → warning about background load  
3. Disable API key / empty pool → heuristic_only message  
4. Invalid URL → inline error, form fields unchanged  
5. Edit existing rule with hostname set → Suggest does not overwrite hostname  

- [ ] **Step 2: Run automated gates**

```bash
pnpm exec vitest run lib/__tests__/siteRuleSuggest.url.test.ts \
  lib/__tests__/siteRuleSuggest.outline.test.ts \
  lib/__tests__/siteRuleSuggest.heuristics.test.ts \
  lib/__tests__/siteRuleSuggest.sanitize.test.ts \
  lib/__tests__/siteRuleSuggest.prompt.test.ts \
  lib/__tests__/siteRuleSuggest.orchestrate.test.ts \
  lib/__tests__/siteRuleSuggest.mergeForm.test.ts \
  content/__tests__/getDomOutline.test.ts \
  entrypoints/options/sections/__tests__/SiteRulesSection.suggest.test.tsx

pnpm exec tsc --noEmit
pnpm exec eslint lib/siteRuleSuggest entrypoints/options/sections/SiteRulesSection.tsx services/background.ts entrypoints/content.ts types/messages.ts --max-warnings 0
```

Fix failures.

- [ ] **Step 3: Close beads issue notes + commit any fixes**

```bash
git add -A
git commit -m "test(site-rules): finish AI suggest quality gates"
bd close AnyLLMTranslate-6ui --reason="LLM site rule suggestions from URL implemented per spec"
```

- [ ] **Step 4: Session push protocol when work ends**

```bash
git pull --rebase
bd dolt push
git push
git status
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Paste URL in Add/Edit form | 8 |
| Hybrid capture tab → fallback load | 7 |
| Full draft fields | 3, 4, 7, 8 |
| Review then save (no auto-save) | 8 |
| Same translation LLM | 7 (`initService().translate`) |
| Heuristic fallback + `heuristic_only` | 3, 7 |
| `source` tab \| fetch only | 1, 7 |
| Outline caps / privacy | 2 |
| Sanitize selectors | 3 |
| Status copy tab/fetch/heuristic | 8 |
| Merge rules Add vs Edit | 8 (`mergeForm`) |
| Message contract | 5, 6, 7 |
| http(s) only | 1, 7 |
| Tests | 1–8, 9 |
| No runtime matching changes | (no `findEffectiveRule` edits) |
| `tabs` permission for discovery/temp tab | 5 |

## Placeholder / consistency self-review

- No TBD steps; temp-tab fallback is the locked fetch implementation (warning `loaded_in_temp_tab`)
- Types use `SuggestSiteRuleDraft` / `success` result field consistently (`success` not `ok` to match existing message results like `ExtractPdfTermsResult`)
- Spec sketch used `ok: true`; **plan standardizes on `success`** to match codebase — implementers must use `success`
- LLM path mirrors `EXTRACT_PDF_TERMS` (`returnRawResponse` + custom prompts)
