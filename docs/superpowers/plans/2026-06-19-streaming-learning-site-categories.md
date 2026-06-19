# Streaming & Learning Site Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `DOMAIN_CATEGORY_MAP` with 18 new streaming-movie/TV and online-learning domains so context-aware translation reliably categorizes those sites without relying on heuristics.

**Architecture:** Pure-data change. Append 18 entries to the existing flat `DOMAIN_CATEGORY_MAP` (`Record<string, string>`) in `content/utils/pageContext.ts`, grouped under comment headers. The map is already the first-priority signal in `detectCategory()`, so the new entries win over meta/og/heuristic fallbacks. Add a focused unit test block asserting every new entry against the exported map.

**Tech Stack:** TypeScript, Vitest, ESLint, a WXT (browser extension) codebase using `@/` path alias.

## Global Constraints

- **Categories-only scope.** No subtitle interception, no `isOnWatchPage()` changes, no settings UI changes, no new handlers, no changes to `lib/categories.ts`.
- **Category strings must match `PREDEFINED_CATEGORIES` exactly (Title Case).** The two used here both already exist: `'Streaming Entertainment'` and `'Online Education'`. Do not invent new categories.
- **Domain keys are apex domains** (e.g. `netflix.com`, not `www.netflix.com`). The existing matcher `domain === key || domain.endsWith('.' + key)` covers subdomains automatically — never add per-subdomain entries.
- **Follow the file's existing style:** single quotes for object keys and string values, 2-space indent, trailing comma on the last entry of a group. Keep the existing comment at the top of `DOMAIN_CATEGORY_MAP` ("Values MUST use Title Case to match PREDEFINED_CATEGORIES in lib/categories.ts.").
- **Non-interactive shell flags** on any `cp`/`mv`/`rm` (`-f`/`-rf`), per `AGENTS.md`.

## File Structure

- **Modify:** `content/utils/pageContext.ts` — append 18 entries to `DOMAIN_CATEGORY_MAP` (the only source file touched).
- **Modify:** `content/utils/__tests__/pageContext.test.ts` — add a `describe('DOMAIN_CATEGORY_MAP')` block importing and asserting the exported map.

No new files. No other files touched.

---

### Task 1: Lock in the new domain→category mappings with a failing test

**Files:**
- Modify: `content/utils/__tests__/pageContext.test.ts`

**Interfaces:**
- Consumes: `DOMAIN_CATEGORY_MAP` exported from `content/utils/pageContext.ts` (already exported — see the `export const DOMAIN_CATEGORY_MAP` declaration around line 21).
- Produces: a test block that will fail until Task 2 adds the 18 entries.

- [ ] **Step 1: Update the import line to also bring in `DOMAIN_CATEGORY_MAP`**

In `content/utils/__tests__/pageContext.test.ts`, change the existing import (currently line 7):

```ts
import { extractPageContext, resolveCategory, detectLLMCategoryIfNeeded, triggerAutoCategoryDetection } from '../pageContext';
```

to:

```ts
import { extractPageContext, resolveCategory, detectLLMCategoryIfNeeded, triggerAutoCategoryDetection, DOMAIN_CATEGORY_MAP } from '../pageContext';
```

- [ ] **Step 2: Add the failing test block**

Append this `describe` block at the end of the file (after the final closing `});` of the last existing top-level `describe`):

```ts
describe('DOMAIN_CATEGORY_MAP', () => {
  it('maps every streaming domain to Streaming Entertainment', () => {
    const streaming = [
      'netflix.com',
      'disneyplus.com',
      'hulu.com',
      'primevideo.com',
      'tv.apple.com',
      'peacocktv.com',
      'paramountplus.com',
      'max.com',
      'youku.com',
      'iqiyi.com',
      'v.qq.com',
      'bilibili.com',
    ];
    for (const domain of streaming) {
      expect(DOMAIN_CATEGORY_MAP[domain]).toBe('Streaming Entertainment');
    }
  });

  it('maps every learning domain to Online Education', () => {
    const learning = [
      'udemy.com',
      'coursera.org',
      'khanacademy.org',
      'edx.org',
      'pluralsight.com',
      'skillshare.com',
      'udacity.com',
      'duolingo.com',
      'lingoda.com',
    ];
    for (const domain of learning) {
      expect(DOMAIN_CATEGORY_MAP[domain]).toBe('Online Education');
    }
  });

  it('does not collide with a non-streaming apex like netflix.com being reused elsewhere', () => {
    // Sanity: the two streaming entries that already existed are still correct.
    expect(DOMAIN_CATEGORY_MAP['netflix.com']).toBe('Streaming Entertainment');
    expect(DOMAIN_CATEGORY_MAP['youtube.com']).toBe('Video Platform');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
pnpm vitest run content/utils/__tests__/pageContext.test.ts -t "DOMAIN_CATEGORY_MAP"
```
Expected: FAIL. The `streaming` test fails on the first missing domain (e.g. `disneyplus.com` → `undefined` instead of `'Streaming Entertainment'`); the `learning` test fails on `khanacademy.org`. (`netflix.com`, `youtube.com`, `udemy.com`, `coursera.org` already pass — they pre-exist.)

- [ ] **Step 4: Commit the failing test**

```bash
git add content/utils/__tests__/pageContext.test.ts
git commit -m "test(pageContext): assert streaming & learning domain category mappings"
```

---

### Task 2: Add the 18 new entries to `DOMAIN_CATEGORY_MAP`

**Files:**
- Modify: `content/utils/pageContext.ts:21-59` (the `DOMAIN_CATEGORY_MAP` object literal)

**Interfaces:**
- Consumes: nothing from Task 1 beyond the test contract.
- Produces: an 18-entry-larger `DOMAIN_CATEGORY_MAP` that makes Task 1's tests pass. All values use existing `PREDEFINED_CATEGORIES` strings; no new category is introduced.

- [ ] **Step 1: Add the streaming and learning entries with comment headers**

Open `content/utils/pageContext.ts`. The `DOMAIN_CATEGORY_MAP` literal currently ends with:

```ts
  'ieee.org': 'Software Development',
  'acm.org': 'Academic Research',
};
```

Replace that closing with the following (preserving the two existing trailing entries and adding two grouped blocks, then the `};`):

```ts
  'ieee.org': 'Software Development',
  'acm.org': 'Academic Research',

  // Streaming movie/TV platforms
  'disneyplus.com': 'Streaming Entertainment',
  'hulu.com': 'Streaming Entertainment',
  'primevideo.com': 'Streaming Entertainment',
  'tv.apple.com': 'Streaming Entertainment',
  'peacocktv.com': 'Streaming Entertainment',
  'paramountplus.com': 'Streaming Entertainment',
  'max.com': 'Streaming Entertainment',
  'youku.com': 'Streaming Entertainment',
  'iqiyi.com': 'Streaming Entertainment',
  'v.qq.com': 'Streaming Entertainment',
  'bilibili.com': 'Streaming Entertainment',

  // Online learning platforms
  'khanacademy.org': 'Online Education',
  'edx.org': 'Online Education',
  'pluralsight.com': 'Online Education',
  'skillshare.com': 'Online Education',
  'udacity.com': 'Online Education',
  'duolingo.com': 'Online Education',
  'lingoda.com': 'Online Education',
};
```

Notes for the implementer:
- `netflix.com`, `udemy.com`, `coursera.org`, `youtube.com` are **already** in the map above this point — do NOT add duplicates. The test in Task 1 asserts their existing values.
- `max.com` is added here even though HBO Max subtitle handling exists elsewhere; the category map is a separate concern and `max.com` had no category entry before.
- Keep the existing file-top comment that documents "Values MUST use Title Case to match PREDEFINED_CATEGORIES in lib/categories.ts." — both values used here satisfy it.

- [ ] **Step 2: Run the Task 1 tests to verify they pass**

Run:
```bash
pnpm vitest run content/utils/__tests__/pageContext.test.ts -t "DOMAIN_CATEGORY_MAP"
```
Expected: PASS — all three `DOMAIN_CATEGORY_MAP` tests green.

- [ ] **Step 3: Run the full pageContext test file to confirm no regressions**

Run:
```bash
pnpm vitest run content/utils/__tests__/pageContext.test.ts
```
Expected: PASS — all tests in the file (the pre-existing `extractPageContext`, `resolveCategory`, `detectLLMCategoryIfNeeded`, `triggerAutoCategoryDetection` blocks plus the new `DOMAIN_CATEGORY_MAP` block) pass.

- [ ] **Step 4: Run typecheck and lint on the changed files**

Run:
```bash
pnpm compile
pnpm lint
```
Expected: `compile` exits 0 (no type errors). `lint` exits 0 (no lint errors). If lint flags formatting, run `pnpm format` and re-run `pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add content/utils/pageContext.ts
git commit -m "feat(pageContext): add streaming & learning site domain categories"
```

---

### Task 3: Final verification & push

**Files:** none modified (verification only).

- [ ] **Step 1: Run the entire test suite**

Run:
```bash
pnpm test
```
Expected: all suites pass. The category-detection tests in `content/__tests__/` and the popup/content tests reference some of these domains; confirm none broke.

- [ ] **Step 2: Confirm git status is clean and on `master`**

Run:
```bash
git status
```
Expected: working tree clean, on branch `master`, 2 new commits ahead of origin (one test commit, one feature commit).

- [ ] **Step 3: Push**

Per `AGENTS.md` session-completion workflow:
```bash
git pull --rebase
git push
git status
```
Expected: `git status` shows "up to date with 'origin/master'".

---

## Self-Review

**1. Spec coverage:**
- "Extend `DOMAIN_CATEGORY_MAP` with 11 new streaming domains" → Task 2 Step 1 (disneyplus, hulu, primevideo, tv.apple, peacocktv, paramountplus, max, youku, iqiyi, v.qq, bilibili = 11). ✓
- "…7 new learning domains" → Task 2 Step 1 (khanacademy, edx, pluralsight, skillshare, udacity, duolingo, lingoda = 7). ✓
- "Category strings already exist in `PREDEFINED_CATEGORIES`" → Global Constraints + Task 2 notes call this out; no `lib/categories.ts` change. ✓
- "Subdomain matching via existing `endsWith` matcher" → Global Constraints + Task 2 notes ("never add per-subdomain entries"). ✓
- "Testing: add `describe('DOMAIN_CATEGORY_MAP')` block asserting representative mappings directly against the exported map" → Task 1 Step 2. ✓
- "Out of scope" items (no handlers / no UI / no `isOnWatchPage`) → Global Constraints explicitly forbids them. ✓

**2. Placeholder scan:** No TBD/TODO/“add error handling”/“similar to Task N”. Every code step shows the literal code. The full entry list is spelled out twice (test + impl) so the implementer can't drop an entry silently. ✓

**3. Type consistency:** `DOMAIN_CATEGORY_MAP` is `Record<string, string>`; both `'Streaming Entertainment'` and `'Online Education'` are valid string values and present in `PREDEFINED_CATEGORIES`. Import name `DOMAIN_CATEGORY_MAP` matches the `export const DOMAIN_CATEGORY_MAP` declaration in `pageContext.ts`. ✓

No issues found. Plan is ready.
