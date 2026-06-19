# Popup "Auto (Category)" Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the category Auto-detect resolved to inline in the popup as `Auto (News)` on every page (including subtitle pages), updating live while the popup is open.

**Architecture:** Separate LLM auto-detected category from the manual/temporary override slot. Today both write to `categoryOverride`, which makes the popup lose the "Auto is active" signal. A new shared singleton (`content/categoryState.ts`) holds the auto-detected value and broadcasts updates to the popup; the refactored `detectLLMCategoryIfNeeded` takes a callback instead of mutating the override store. Both `content.ts` (page translation) and `subtitleCoordinator.ts` (subtitle translation) feed the shared state so the popup reflects subtitle-page detection too.

**Tech Stack:** TypeScript, WXT (browser extension), React 19 (popup), Vitest, chrome.runtime messaging.

**Spec:** `docs/superpowers/specs/2026-06-19-popup-auto-category-display-design.md`

## Global Constraints

- Category priority chain is unchanged for translation: `temp override > siteRule > autoDetected`.
- `detectLLMCategoryIfNeeded` must ignore the category `'Other'` (treated as "no detection").
- Parentheses format only: `Auto (News)` — no middle-dot variants.
- Run `npm test` (vitest run), `npm run compile` (tsc --noEmit), and `npm run lint` after all code tasks.
- Commit after each task.

---

### Task 1: Add `pageCategoryUpdate` message type

**Files:**
- Modify: `types/messages.ts`

**Interfaces:**
- Produces: `PageCategoryUpdateMessage` type and `'pageCategoryUpdate'` action added to the union types. Later tasks send/receive this message.

- [ ] **Step 1: Add the action to `MessageAction`**

In `types/messages.ts`, find the `MessageAction` union (the block of `| '...'` lines under `export type MessageAction =`). Add one line, keeping alphabetical-ish ordering near the other category actions:

```ts
  | 'getPageCategory'
  | 'pageCategoryUpdate'
  | 'DETECT_PAGE_CATEGORY_LLM'
```

- [ ] **Step 2: Add the message interface**

Add this interface right after the existing `GetPageCategoryMessage` interface (which ends with `action: 'getPageCategory'; }`):

```ts
/** Live category update from content script → popup (auto-detection result) */
export interface PageCategoryUpdateMessage {
  action: 'pageCategoryUpdate';
  categoryInfo: CategoryInfo;
}
```

- [ ] **Step 3: Add to the `ExtensionMessage` union**

Find `export type ExtensionMessage =` and add `| PageCategoryUpdateMessage` to the union. Place it after `GetPageCategoryMessage`:

```ts
  | GetPageCategoryMessage
  | PageCategoryUpdateMessage
  | DetectPageCategoryLlmMessage
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run compile`
Expected: PASS (no errors). The new type is unused so far, which is fine.

- [ ] **Step 5: Commit**

```bash
git add types/messages.ts
git commit -m "feat(types): add pageCategoryUpdate message type"
```

---

### Task 2: Create shared `content/categoryState.ts` module (TDD)

**Files:**
- Create: `content/categoryState.ts`
- Test: `content/__tests__/categoryState.test.ts`

**Interfaces:**
- Consumes: `CategoryInfo` from `@/types/messages`, `resolveCategory` from `@/content/utils/pageContext`, `findMatchingRule` from `@/lib/siteRules`, `ExtensionSettings` from `@/types/config`.
- Produces:
  - `getAutoDetectedCategory(): string | undefined`
  - `setAutoDetectedCategory(category: string | undefined): void`
  - `buildCategoryInfo(settings: ExtensionSettings, tabOverride: string | undefined): CategoryInfo`
  - `broadcastCategoryInfo(settings: ExtensionSettings, tabOverride: string | undefined): void`
  - `_resetCategoryState(): void` (test helper)

- [ ] **Step 1: Write the failing tests**

Create `content/__tests__/categoryState.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAutoDetectedCategory,
  setAutoDetectedCategory,
  buildCategoryInfo,
  broadcastCategoryInfo,
  _resetCategoryState,
} from '../categoryState';
import type { ExtensionSettings } from '@/types/config';
import { DEFAULT_SETTINGS } from '@/types/config';

const baseSettings: ExtensionSettings = { ...DEFAULT_SETTINGS };

describe('categoryState', () => {
  beforeEach(() => {
    _resetCategoryState();
  });

  describe('get/setAutoDetectedCategory', () => {
    it('returns undefined by default', () => {
      expect(getAutoDetectedCategory()).toBeUndefined();
    });

    it('stores and returns the category', () => {
      setAutoDetectedCategory('News');
      expect(getAutoDetectedCategory()).toBe('News');
    });

    it('can be cleared with undefined', () => {
      setAutoDetectedCategory('News');
      setAutoDetectedCategory(undefined);
      expect(getAutoDetectedCategory()).toBeUndefined();
    });
  });

  describe('buildCategoryInfo', () => {
    it('returns effective = autoDetected when no siteRule or override', () => {
      setAutoDetectedCategory('News');
      const info = buildCategoryInfo(baseSettings, undefined);
      expect(info.autoDetected).toBe('News');
      expect(info.override).toBeUndefined();
      expect(info.effective).toBe('News');
    });

    it('prefers siteRule over autoDetected', () => {
      setAutoDetectedCategory('News');
      const settings = {
        ...baseSettings,
        siteRules: [{ id: '1', hostname: 'example.com', includeSelectors: [], excludeSelectors: [], alwaysTranslate: false, neverTranslate: false, builtIn: false, category: 'Encyclopedia' }],
      };
      const info = buildCategoryInfo(settings, undefined);
      expect(info.effective).toBe('Encyclopedia');
    });

    it('prefers override over siteRule and autoDetected', () => {
      setAutoDetectedCategory('News');
      const settings = {
        ...baseSettings,
        siteRules: [{ id: '1', hostname: 'example.com', includeSelectors: [], excludeSelectors: [], alwaysTranslate: false, neverTranslate: false, builtIn: false, category: 'Encyclopedia' }],
      };
      const info = buildCategoryInfo(settings, 'Gaming');
      expect(info.effective).toBe('Gaming');
    });
  });

  describe('broadcastCategoryInfo', () => {
    it('sends a pageCategoryUpdate message with the built CategoryInfo', () => {
      setAutoDetectedCategory('News');
      broadcastCategoryInfo(baseSettings, undefined);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'pageCategoryUpdate',
          categoryInfo: expect.objectContaining({ autoDetected: 'News', effective: 'News' }),
        }),
      );
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run content/__tests__/categoryState.test.ts`
Expected: FAIL — module `../categoryState` not found.

- [ ] **Step 3: Write the implementation**

Create `content/categoryState.ts`:

```ts
/**
 * Shared auto-detected category state.
 *
 * Both entrypoints/content.ts (page translation) and content/subtitleCoordinator.ts
 * (subtitle translation) run LLM category detection independently. Since they share
 * one content-script context and the popup queries content.ts via getPageCategory,
 * this singleton lets subtitle-page detection reach the popup too.
 */

import type { ExtensionSettings } from '@/types/config';
import type { CategoryInfo } from '@/types/messages';
import { resolveCategory } from '@/content/utils/pageContext';
import { findMatchingRule } from '@/lib/siteRules';

let autoDetectedCategory: string | undefined;

/** Get the current auto-detected category (LLM or heuristic). */
export function getAutoDetectedCategory(): string | undefined {
  return autoDetectedCategory;
}

/** Set the auto-detected category (called from detection callbacks). */
export function setAutoDetectedCategory(category: string | undefined): void {
  autoDetectedCategory = category;
}

/**
 * Build the full CategoryInfo using the priority chain:
 * override > siteRule > autoDetected.
 */
export function buildCategoryInfo(
  settings: ExtensionSettings,
  tabOverride: string | undefined,
): CategoryInfo {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const matchingRule = findMatchingRule(hostname, settings.siteRules ?? []);
  const autoDetected = autoDetectedCategory;
  const siteRule = matchingRule?.category;
  const effective = resolveCategory(autoDetected, siteRule, tabOverride);
  return { autoDetected, siteRule, override: tabOverride, effective };
}

/** Broadcast current category info to the popup for live refresh. */
export function broadcastCategoryInfo(
  settings: ExtensionSettings,
  tabOverride: string | undefined,
): void {
  const categoryInfo = buildCategoryInfo(settings, tabOverride);
  chrome.runtime
    .sendMessage({ action: 'pageCategoryUpdate', categoryInfo })
    .catch(() => {
      /* popup may not be open */
    });
}

/** Reset all state (for testing). */
export function _resetCategoryState(): void {
  autoDetectedCategory = undefined;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run content/__tests__/categoryState.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add content/categoryState.ts content/__tests__/categoryState.test.ts
git commit -m "feat(category): add shared categoryState singleton for auto-detected category"
```

---

### Task 3: Refactor `detectLLMCategoryIfNeeded` (TDD)

**Files:**
- Modify: `content/utils/pageContext.ts`
- Test: `content/utils/__tests__/pageContext.test.ts`

**Interfaces:**
- Consumes: `PageContext`, `ExtensionSettings` (existing).
- Produces: new signature:
  ```ts
  export async function detectLLMCategoryIfNeeded(
    pageContext: PageContext,
    settings: ExtensionSettings,
    manualOverride: string | undefined,
    existingAutoDetected: string | undefined,
    onDetected: (category: string) => void,
  ): Promise<void>
  ```
  No longer sends `setCategoryOverride`. Instead calls `onDetected(category)` on success.

- [ ] **Step 1: Write the failing tests**

Append to `content/utils/__tests__/pageContext.test.ts` (after the existing `resolveCategory` describe block). First add imports at the top of the file — change the import line:

```ts
import { extractPageContext, resolveCategory, detectLLMCategoryIfNeeded } from '../pageContext';
```

Then append this describe block at the end of the file:

```ts
describe('detectLLMCategoryIfNeeded', () => {
  const baseSettings = {
    enableLLMPageCategoryDetection: true,
    llmCategoryDetectionMode: 'blocking',
  } as const;

  function makePageContext() {
    return { title: 'Test', description: '', domain: 'example.com' };
  }

  beforeEach(() => {
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ success: true, category: 'News' }) },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns early when LLM detection is disabled', async () => {
    const onDetected = vi.fn();
    const settings = { ...baseSettings, enableLLMPageCategoryDetection: false };
    await detectLLMCategoryIfNeeded(makePageContext(), settings as never, undefined, undefined, onDetected);
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('returns early when a manual override is set', async () => {
    const onDetected = vi.fn();
    await detectLLMCategoryIfNeeded(makePageContext(), baseSettings as never, 'Gaming', undefined, onDetected);
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('returns early when existingAutoDetected is already set', async () => {
    const onDetected = vi.fn();
    await detectLLMCategoryIfNeeded(makePageContext(), baseSettings as never, undefined, 'News', onDetected);
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('calls onDetected with the LLM category in blocking mode', async () => {
    const onDetected = vi.fn();
    const ctx = makePageContext();
    await detectLLMCategoryIfNeeded(ctx, baseSettings as never, undefined, undefined, onDetected);
    expect(onDetected).toHaveBeenCalledWith('News');
    expect(ctx.category).toBe('News');
  });

  it('does NOT call onDetected when category is Other', async () => {
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ success: true, category: 'Other' }) },
    });
    const onDetected = vi.fn();
    await detectLLMCategoryIfNeeded(makePageContext(), baseSettings as never, undefined, undefined, onDetected);
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('does NOT send setCategoryOverride', async () => {
    const sendSpy = vi.fn().mockResolvedValue({ success: true, category: 'News' });
    vi.stubGlobal('chrome', { runtime: { sendMessage: sendSpy } });
    await detectLLMCategoryIfNeeded(makePageContext(), baseSettings as never, undefined, undefined, vi.fn());
    const overrideCalls = sendSpy.mock.calls.filter((c: unknown[]) => (c[0] as { action?: string }).action === 'setCategoryOverride');
    expect(overrideCalls).toHaveLength(0);
  });

  it('calls onDetected in async mode', async () => {
    const sendSpy = vi.fn().mockResolvedValue({ success: true, category: 'Academic Research' });
    vi.stubGlobal('chrome', { runtime: { sendMessage: sendSpy } });
    const onDetected = vi.fn();
    const settings = { ...baseSettings, llmCategoryDetectionMode: 'async' } as never;
    await detectLLMCategoryIfNeeded(makePageContext(), settings, undefined, undefined, onDetected);
    // async mode resolves the promise internally; flush microtasks
    await new Promise((r) => setTimeout(r, 0));
    expect(onDetected).toHaveBeenCalledWith('Academic Research');
  });
});
```

Also ensure `vi` is imported — update the top import:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run content/utils/__tests__/pageContext.test.ts`
Expected: FAIL — tests for `detectLLMCategoryIfNeeded` fail because the old signature doesn't accept the new args / still sends `setCategoryOverride`.

- [ ] **Step 3: Refactor the implementation**

In `content/utils/pageContext.ts`, replace the entire `detectLLMCategoryIfNeeded` function with:

```ts
/**
 * Perform LLM category detection based on settings mode.
 * - blocking: awaits detection, sets pageContext.category, calls onDetected
 * - async: dispatches detection in background, calls onDetected on completion
 *
 * No longer mutates the override store — the caller decides what to do with
 * the result via the onDetected callback.
 */
export async function detectLLMCategoryIfNeeded(
  pageContext: PageContext,
  settings: ExtensionSettings,
  manualOverride: string | undefined,
  existingAutoDetected: string | undefined,
  onDetected: (category: string) => void,
): Promise<void> {
  if (!settings.enableLLMPageCategoryDetection) return;
  if (manualOverride) return;
  if (existingAutoDetected) return;

  if (settings.llmCategoryDetectionMode === 'blocking') {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'DETECT_PAGE_CATEGORY_LLM', pageContext });
      if (res?.success && res.category && res.category !== 'Other') {
        pageContext.category = res.category;
        onDetected(res.category);
      }
    } catch {
      return;
    }
  } else {
    // async mode
    chrome.runtime.sendMessage({ action: 'DETECT_PAGE_CATEGORY_LLM', pageContext }).then((res) => {
      if (res?.success && res.category && res.category !== 'Other') {
        onDetected(res.category);
      }
    }).catch(() => {});
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run content/utils/__tests__/pageContext.test.ts`
Expected: PASS — all existing tests + new tests green.

- [ ] **Step 5: Commit**

```bash
git add content/utils/pageContext.ts content/utils/__tests__/pageContext.test.ts
git commit -m "refactor(pageContext): detectLLMCategoryIfNeeded uses callback instead of override side-effect"
```

---

### Task 4: Wire `entrypoints/content.ts` to shared categoryState

**Files:**
- Modify: `entrypoints/content.ts`

**Interfaces:**
- Consumes: `getAutoDetectedCategory`, `setAutoDetectedCategory`, `buildCategoryInfo`, `broadcastCategoryInfo` from `@/content/categoryState`; refactored `detectLLMCategoryIfNeeded` (5-arg signature).
- Produces: `getPageCategory` returns the shared auto-detected value; `pageCategoryUpdate` broadcast fires on detection and on manual override change.

- [ ] **Step 1: Add the import**

In `entrypoints/content.ts`, add to the existing import from `@/content/utils/pageContext` (which currently imports `extractPageContext, resolveCategory, detectLLMCategoryIfNeeded`). Replace that import line with:

```ts
import { extractPageContext, resolveCategory, detectLLMCategoryIfNeeded } from '@/content/utils/pageContext';
import {
  getAutoDetectedCategory,
  setAutoDetectedCategory,
  buildCategoryInfo,
  broadcastCategoryInfo,
} from '@/content/categoryState';
```

- [ ] **Step 2: Update the detection call in the translation flow**

Find this block (inside the translate/translatePieces flow):

```ts
    if (pageContext) {
      await detectLLMCategoryIfNeeded(pageContext, settings, categoryOverride);
    }
```

Replace it with:

```ts
    if (pageContext) {
      await detectLLMCategoryIfNeeded(
        pageContext,
        settings,
        categoryOverride,
        getAutoDetectedCategory(),
        (cat) => {
          setAutoDetectedCategory(cat);
          broadcastCategoryInfo(settings, categoryOverride);
        },
      );
    }
```

- [ ] **Step 3: Update the `categoryChanged` message handler**

Find:

```ts
    } else if (message.action === 'categoryChanged') {
      // Update module-level category override from background
      categoryOverride = message.category ?? undefined;
    } else if (message.action === 'getPageCategory') {
```

Replace with:

```ts
    } else if (message.action === 'categoryChanged') {
      // Update module-level category override from background
      categoryOverride = message.category ?? undefined;
      // Refresh popup so manual override reflects immediately
      loadSettings().then((s) => broadcastCategoryInfo(s, categoryOverride));
    } else if (message.action === 'getPageCategory') {
```

- [ ] **Step 4: Update the `getPageCategory` handler**

Find the entire `getPageCategory` handler block:

```ts
    } else if (message.action === 'getPageCategory') {
      // Return full category info to popup
      (async () => {
        const catSettings = await loadSettings();
        const autoDetected = catSettings.enableLLMPageCategoryDetection
          ? extractPageContext(document, true).category
          : undefined;
        const hostname = window.location.hostname;
        const catRule = findMatchingRule(hostname, catSettings.siteRules);
        const siteRuleCat = catRule?.category;
        const effective = resolveCategory(autoDetected, siteRuleCat, categoryOverride);
        sendResponse({
          autoDetected,
          siteRule: siteRuleCat,
          override: categoryOverride,
          effective,
        });
      })();
      return true; // async response
```

Replace with:

```ts
    } else if (message.action === 'getPageCategory') {
      // Return full category info to popup
      (async () => {
        const catSettings = await loadSettings();
        // Prefer the LLM-detected value from shared state; fall back to heuristic
        const autoDetected = getAutoDetectedCategory()
          ?? (catSettings.enableLLMPageCategoryDetection
            ? extractPageContext(document, true).category
            : undefined);
        setAutoDetectedCategory(autoDetected);
        sendResponse(buildCategoryInfo(catSettings, categoryOverride));
      })();
      return true; // async response
```

- [ ] **Step 5: Verify it compiles**

Run: `npm run compile`
Expected: PASS. (`resolveCategory` and `findMatchingRule` may now be unused in content.ts — if tsc complains about unused imports, leave them; they are still used in the `if (pageContext)` block further down. If the lint flags them, that is addressed in Task 7.)

- [ ] **Step 6: Run existing content tests**

Run: `npx vitest run content/`
Expected: PASS (existing tests should still pass; content.ts itself is not directly unit-tested but imports must resolve).

- [ ] **Step 7: Commit**

```bash
git add entrypoints/content.ts
git commit -m "feat(content): wire categoryState for auto-detected category + popup broadcast"
```

---

### Task 5: Wire `content/subtitleCoordinator.ts` to shared categoryState

**Files:**
- Modify: `content/subtitleCoordinator.ts`

**Interfaces:**
- Consumes: `setAutoDetectedCategory`, `broadcastCategoryInfo` from `@/content/categoryState`; refactored `detectLLMCategoryIfNeeded` (5-arg signature).
- Produces: subtitle-page LLM detection feeds the shared state so the popup reflects it.

- [ ] **Step 1: Add the import**

In `content/subtitleCoordinator.ts`, find the existing import:

```ts
import { extractPageContext, resolveCategory, detectLLMCategoryIfNeeded } from '@/content/utils/pageContext';
```

Add a new import line right after it:

```ts
import { setAutoDetectedCategory, broadcastCategoryInfo } from '@/content/categoryState';
```

- [ ] **Step 2: Update the detection call in `buildSubtitlePageContext`**

Find this block inside `buildSubtitlePageContext`:

```ts
  const pageContext = extractPageContext(document, settings.enableLLMPageCategoryDetection);
  await detectLLMCategoryIfNeeded(pageContext, settings, state.categoryOverride);
```

Replace with:

```ts
  const pageContext = extractPageContext(document, settings.enableLLMPageCategoryDetection);
  await detectLLMCategoryIfNeeded(
    pageContext,
    settings,
    state.categoryOverride,
    undefined,
    (cat) => {
      setAutoDetectedCategory(cat);
      broadcastCategoryInfo(settings, state.categoryOverride);
    },
  );
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run compile`
Expected: PASS.

- [ ] **Step 4: Run subtitle coordinator tests**

Run: `npx vitest run content/__tests__/subtitleCoordinator.test.ts`
Expected: PASS. The mock `(...args: unknown[]) => mockDetectLLMCategoryIfNeeded(...args)` accepts any arity, so the new 5-arg call is transparently mocked.

- [ ] **Step 5: Commit**

```bash
git add content/subtitleCoordinator.ts
git commit -m "feat(subtitles): wire categoryState for subtitle-page auto-detected category"
```

---

### Task 6: Update popup display + live refresh

**Files:**
- Modify: `entrypoints/popup/App.tsx`

**Interfaces:**
- Consumes: `pageCategoryUpdate` messages (from Task 1), `CategoryInfo` type.
- Produces: popup shows `Auto (News)` when Auto mode resolves a category; updates live while open.

- [ ] **Step 1: Handle `pageCategoryUpdate` in the message listener**

In `entrypoints/popup/App.tsx`, find the `messageListener` inside the `useEffect`:

```ts
    const messageListener = (message: ExtensionMessage) => {
      if (message.action === 'statusUpdate') {
        setStatus(message.status);
        setIsTranslating(message.status.status === 'translating');
      }
    };
```

Replace with:

```ts
    const messageListener = (message: ExtensionMessage) => {
      if (message.action === 'statusUpdate') {
        setStatus(message.status);
        setIsTranslating(message.status.status === 'translating');
      } else if (message.action === 'pageCategoryUpdate') {
        setCategoryInfo(message.categoryInfo);
      }
    };
```

- [ ] **Step 2: Pass `autoDetected` instead of `effective` to CategoryPicker**

Find (near the bottom of the `App` component, before `return`):

```ts
  const effectiveCategoryDisplay = categoryInfo?.effective;
```

Replace with:

```ts
  const detectedCategoryDisplay = categoryInfo?.autoDetected;
```

Then find the `<CategoryPicker>` usage and update the prop:

```tsx
        {showCategoryDropdown && (
          <CategoryPicker
            currentValue={currentCategoryValue}
            isCustomEntry={isCustomEntry}
            effectiveCategory={effectiveCategoryDisplay}
```

Replace `effectiveCategory={effectiveCategoryDisplay}` with `detectedCategory={detectedCategoryDisplay}`:

```tsx
        {showCategoryDropdown && (
          <CategoryPicker
            currentValue={currentCategoryValue}
            isCustomEntry={isCustomEntry}
            detectedCategory={detectedCategoryDisplay}
```

- [ ] **Step 3: Rename the prop in `CategoryPicker` and change the display format**

In the `CategoryPicker` function signature, find:

```ts
function CategoryPicker({
  currentValue,
  isCustomEntry,
  effectiveCategory,
  customCategoryInput,
```

Replace `effectiveCategory` with `detectedCategory`:

```ts
function CategoryPicker({
  currentValue,
  isCustomEntry,
  detectedCategory,
  customCategoryInput,
```

Also update the type annotation in the same signature — find:

```ts
  effectiveCategory?: string;
```

Replace with:

```ts
  detectedCategory?: string;
```

- [ ] **Step 4: Change the trigger label to parentheses format**

Find the `displayLabel` computation:

```ts
  const displayLabel = currentValue === '__auto__'
    ? `Auto${effectiveCategory ? ` · ${effectiveCategory}` : ''}`
    : isCustomEntry
      ? currentValue
      : currentValue;
```

Replace with:

```ts
  const displayLabel = currentValue === '__auto__'
    ? `Auto${detectedCategory ? ` (${detectedCategory})` : ''}`
    : currentValue;
```

- [ ] **Step 5: Update the "Auto Detect" row in the dropdown**

Find the Auto Detect button block:

```tsx
                <button
                  onClick={() => { onCategoryChange('__auto__'); setIsOpen(false); setSearch(''); }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${
                    currentValue === '__auto__'
                      ? 'bg-blue-500/15 text-blue-400 font-medium'
                      : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100'
                  }`}
                >
                  <Sparkles className="w-3 h-3 shrink-0 opacity-70" />
                  <span className="truncate">Auto Detect</span>
                  {effectiveCategory && currentValue === '__auto__' && (
                    <span className="ml-auto text-[10px] text-zinc-500 truncate max-w-[100px]">{effectiveCategory}</span>
                  )}
                  {currentValue === '__auto__' && <CheckCircle2 className="w-3 h-3 shrink-0 text-blue-400 ml-auto" />}
                </button>
```

Replace with:

```tsx
                <button
                  onClick={() => { onCategoryChange('__auto__'); setIsOpen(false); setSearch(''); }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${
                    currentValue === '__auto__'
                      ? 'bg-blue-500/15 text-blue-400 font-medium'
                      : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100'
                  }`}
                >
                  <Sparkles className="w-3 h-3 shrink-0 opacity-70" />
                  <span className="truncate">
                    Auto Detect{detectedCategory && currentValue === '__auto__' ? ` (${detectedCategory})` : ''}
                  </span>
                  {currentValue === '__auto__' && <CheckCircle2 className="w-3 h-3 shrink-0 text-blue-400 ml-auto" />}
                </button>
```

- [ ] **Step 6: Verify it compiles**

Run: `npm run compile`
Expected: PASS — no references to the old `effectiveCategory` prop remain.

- [ ] **Step 7: Commit**

```bash
git add entrypoints/popup/App.tsx
git commit -m "feat(popup): show Auto (Category) and refresh live on detection"
```

---

### Task 7: Full test, lint, compile, and manual verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green. If any test references the old `detectLLMCategoryIfNeeded` 3-arg signature or the old `effectiveCategory` prop, fix it (the subtitleCoordinator mock uses `(...args)` spread so should be fine).

- [ ] **Step 2: Run the compiler**

Run: `npm run compile`
Expected: PASS — no type errors.

- [ ] **Step 3: Run the linter**

Run: `npm run lint`
Expected: PASS. If `resolveCategory` or `findMatchingRule` are now flagged as unused in `content.ts`, check: they are still used in the `if (pageContext)` block after the detection call (the `resolveCategory(pageContext.category, matchingRule?.category, categoryOverride)` block). If genuinely unused, remove the import. Do NOT remove imports that are still referenced.

- [ ] **Step 4: Manual smoke test (if a browser is available)**

Build: `npm run build`
Load the extension, open a known-domain page (e.g. `wikipedia.org`), enable Context-Aware Translation + Page Category Detection in Advanced settings, open the popup, click Translate Page, and confirm the Category row shows `Auto (Encyclopedia)` without opening the dropdown.

If no browser is available, skip this step and note it for the user.

- [ ] **Step 5: Final commit (if lint made changes)**

```bash
git add -A
git commit -m "chore: lint fixes for category display feature" --allow-empty
```

(Only commit if there are actual changes. Skip if clean.)

---

## Self-Review Notes

**Spec coverage:**
- Section 1 (refactor `detectLLMCategoryIfNeeded`) → Task 3. ✓
- Section 2 (`content/categoryState.ts` shared state) → Task 2. ✓
- Section 3 (`content.ts` wiring) → Task 4. ✓
- Section 4 (`subtitleCoordinator.ts` wiring) → Task 5. ✓
- Section 5 (`types/messages.ts`) → Task 1. ✓
- Section 6 (`popup/App.tsx`) → Task 6. ✓
- Section 7 (tests) → Tasks 2, 3 (unit), Task 7 (full suite + manual). ✓
- Behavior matrix verified in Task 6 display logic. ✓

**Type consistency:**
- `PageCategoryUpdateMessage.categoryInfo: CategoryInfo` (Task 1) matches `buildCategoryInfo` return (Task 2) and `setCategoryInfo(message.categoryInfo)` (Task 6). ✓
- `detectLLMCategoryIfNeeded` 5-arg signature (Task 3) matches call sites in Task 4 (content.ts) and Task 5 (subtitleCoordinator.ts). ✓
- `detectedCategory` prop name consistent across Task 6 steps. ✓
