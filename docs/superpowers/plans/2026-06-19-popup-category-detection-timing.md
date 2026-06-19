# Popup Category Detection Timing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the popup show an auto-detected page category on regular pages and subtitle watch pages *before* any translation is issued, using a hybrid of lazy (popup-open) detection for regular pages and proactive (load-time) detection for subtitle watch pages, with a shared in-flight guard to prevent duplicate calls.

**Architecture:** Add an in-flight guard to the shared `categoryState` singleton, plus a reusable `triggerAutoCategoryDetection` helper in `pageContext.ts`. The content script's `getPageCategory` handler fires lazy async detection when the singleton is empty. The subtitle coordinator fires a debounced proactive detection when it starts on a watch page. Both write into the singleton and broadcast `pageCategoryUpdate` to the popup, which already listens for it.

**Tech Stack:** TypeScript, WXT (browser extension), Vitest + jsdom, chrome.runtime messaging.

## Global Constraints

- `enableLLMPageCategoryDetection` is a boolean setting (`types/config.ts:218`), default `false`. Detection must no-op when disabled.
- `llmCategoryDetectionMode` is `'async' | 'blocking'` (`types/config.ts:220`), default `'async'`.
- `detectLLMCategoryIfNeeded` already short-circuits on a manual override, an existing auto-detected value, or an LLM `'Other'` result — do not change these guards.
- Category resolution priority is `override > siteRule > autoDetected` (`resolveCategory` in `content/utils/pageContext.ts:128-134`) — unchanged.
- All LLM detection is fire-and-forget; failures are swallowed (existing `.catch(() => {})` pattern). The in-flight flag must clear on both success and failure.
- Tests run via `pnpm test` (vitest). Tests live next to source under `content/__tests__/` and `content/utils/__tests__/`. Test files import from `vitest`, use `vi.mock` for module deps, and stub `chrome` via `vi.stubGlobal` or `global.chrome = {...}`.
- Existing tests must keep passing: `pnpm test -- content/__tests__/categoryState.test.ts content/utils/__tests__/pageContext.test.ts content/__tests__/subtitleCoordinator.test.ts entrypoints/__tests__/content.test.ts`.
- Use non-interactive shell forms (`cp -f`, `rm -f`) per AGENTS.md.

---

## File Structure

- **Modify** `content/categoryState.ts` — add in-flight guard (`isCategoryDetectionInFlight`, `setCategoryDetectionInFlight`); reset in `_resetCategoryState`.
- **Modify** `content/utils/pageContext.ts` — add `triggerAutoCategoryDetection` helper; refactor `entrypoints/content.ts` and `content/subtitleCoordinator.ts` `onDetected` callbacks to use it (DRY).
- **Modify** `entrypoints/content.ts` — `getPageCategory` handler fires lazy detection when singleton empty + detection enabled + no override + not in flight.
- **Modify** `content/subtitleCoordinator.ts` — `startCoordinator` fires a debounced proactive detection when `isOnWatchPage()` and detection enabled and no override and no existing autoDetected.
- **Modify** `content/__tests__/categoryState.test.ts` — in-flight guard tests.
- **Modify** `content/utils/__tests__/pageContext.test.ts` — `triggerAutoCategoryDetection` tests.
- **Modify** `content/__tests__/subtitleCoordinator.test.ts` — proactive detection tests.

---

### Task 1: In-flight guard in categoryState

**Files:**
- Modify: `content/categoryState.ts:15-59`
- Test: `content/__tests__/categoryState.test.ts`

**Interfaces:**
- Produces: `isCategoryDetectionInFlight(): boolean`, `setCategoryDetectionInFlight(v: boolean): void`. `_resetCategoryState()` now also resets the in-flight flag.

- [ ] **Step 1: Write the failing test**

Append to `content/__tests__/categoryState.test.ts` inside the top `describe('categoryState', ...)` block, after the existing `broadcastCategoryInfo` describe:

```ts
  describe('categoryDetectionInFlight guard', () => {
    it('is false by default', () => {
      expect(isCategoryDetectionInFlight()).toBe(false);
    });

    it('setCategoryDetectionInFlight(true) makes isCategoryDetectionInFlight return true', () => {
      setCategoryDetectionInFlight(true);
      expect(isCategoryDetectionInFlight()).toBe(true);
    });

    it('can be cleared by setting false', () => {
      setCategoryDetectionInFlight(true);
      setCategoryDetectionInFlight(false);
      expect(isCategoryDetectionInFlight()).toBe(false);
    });

    it('_resetCategoryState clears the in-flight flag', () => {
      setCategoryDetectionInFlight(true);
      _resetCategoryState();
      expect(isCategoryDetectionInFlight()).toBe(false);
    });
  });
```

Also add `isCategoryDetectionInFlight`, `setCategoryDetectionInFlight` to the existing import at the top of the file:

```ts
import {
  getAutoDetectedCategory,
  setAutoDetectedCategory,
  buildCategoryInfo,
  broadcastCategoryInfo,
  isCategoryDetectionInFlight,
  setCategoryDetectionInFlight,
  _resetCategoryState,
} from '../categoryState';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- content/__tests__/categoryState.test.ts`
Expected: FAIL — `isCategoryDetectionInFlight` is not exported / not a function.

- [ ] **Step 3: Write minimal implementation**

In `content/categoryState.ts`, add a module variable after `autoDetectedCategory` (line 15):

```ts
let autoDetectedCategory: string | undefined;
let categoryDetectionInFlight = false;

/** Whether an LLM category detection call is currently in progress. */
export function isCategoryDetectionInFlight(): boolean {
  return categoryDetectionInFlight;
}

/** Mark LLM category detection as in-progress (or clear it). */
export function setCategoryDetectionInFlight(v: boolean): void {
  categoryDetectionInFlight = v;
}
```

Update `_resetCategoryState` (line 57-59):

```ts
/** Reset all state (for testing). */
export function _resetCategoryState(): void {
  autoDetectedCategory = undefined;
  categoryDetectionInFlight = false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- content/__tests__/categoryState.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add content/categoryState.ts content/__tests__/categoryState.test.ts
git commit -m "feat(categoryState): add categoryDetectionInFlight guard"
```

---

### Task 2: `triggerAutoCategoryDetection` helper in pageContext

**Files:**
- Modify: `content/utils/pageContext.ts:144-173`
- Test: `content/utils/__tests__/pageContext.test.ts`

**Interfaces:**
- Consumes: `getAutoDetectedCategory`, `isCategoryDetectionInFlight`, `setCategoryDetectionInFlight` from `@/content/categoryState`.
- Produces:

```ts
export async function triggerAutoCategoryDetection(
  settings: ExtensionSettings,
  manualOverride: string | undefined,
  onDetected: (category: string) => void,
): Promise<void>
```

Behavior: if detection disabled, override set, or existing auto-detected value, or already in flight → return without calling. Otherwise set in-flight `true`, build page context via `extractPageContext(document, settings.enableLLMPageCategoryDetection)`, call `detectLLMCategoryIfNeeded(...)`. The `onDetected` wrapper passed to `detectLLMCategoryIfNeeded` clears the in-flight flag, then invokes the caller's `onDetected`. A `.finally`-style guard also clears the flag if `detectLLMCategoryIfNeeded` resolves without calling `onDetected` (e.g. `'Other'` result, or failure in async mode's `.catch`).

- [ ] **Step 1: Write the failing test**

Add a new `describe` block at the end of `content/utils/__tests__/pageContext.test.ts`. First add imports to the existing import line at top of file:

```ts
import { extractPageContext, resolveCategory, detectLLMCategoryIfNeeded, triggerAutoCategoryDetection } from '../pageContext';
```

And mock the categoryState module. Add after the existing imports near the top:

```ts
vi.mock('@/content/categoryState', () => ({
  getAutoDetectedCategory: vi.fn(() => undefined),
  setAutoDetectedCategory: vi.fn(),
  setCategoryDetectionInFlight: vi.fn(),
  isCategoryDetectionInFlight: vi.fn(() => false),
  buildCategoryInfo: vi.fn(() => ({ autoDetected: undefined, siteRule: undefined, override: undefined, effective: undefined })),
  broadcastCategoryInfo: vi.fn(),
  _resetCategoryState: vi.fn(),
}));
import { getAutoDetectedCategory, setCategoryDetectionInFlight, isCategoryDetectionInFlight } from '@/content/categoryState';
```

Then append the describe block:

```ts
describe('triggerAutoCategoryDetection', () => {
  const baseSettings = {
    enableLLMPageCategoryDetection: true,
    llmCategoryDetectionMode: 'async',
  } as const;

  beforeEach(() => {
    document.title = 'Some page';
    document.head.innerHTML = '';
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ success: true, category: 'News' }) },
    });
    vi.mocked(getAutoDetectedCategory).mockReturnValue(undefined);
    vi.mocked(isCategoryDetectionInFlight).mockReturnValue(false);
    vi.mocked(setCategoryDetectionInFlight).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns early when LLM detection is disabled', async () => {
    const onDetected = vi.fn();
    const settings = { ...baseSettings, enableLLMPageCategoryDetection: false } as never;
    await triggerAutoCategoryDetection(settings, undefined, onDetected);
    expect(setCategoryDetectionInFlight).not.toHaveBeenCalledWith(true);
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('returns early when a manual override is set', async () => {
    const onDetected = vi.fn();
    await triggerAutoCategoryDetection(baseSettings as never, 'Gaming', onDetected);
    expect(setCategoryDetectionInFlight).not.toHaveBeenCalledWith(true);
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('returns early when an auto-detected value already exists', async () => {
    vi.mocked(getAutoDetectedCategory).mockReturnValue('News');
    const onDetected = vi.fn();
    await triggerAutoCategoryDetection(baseSettings as never, undefined, onDetected);
    expect(setCategoryDetectionInFlight).not.toHaveBeenCalledWith(true);
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('returns early when a detection is already in flight', async () => {
    vi.mocked(isCategoryDetectionInFlight).mockReturnValue(true);
    const onDetected = vi.fn();
    await triggerAutoCategoryDetection(baseSettings as never, undefined, onDetected);
    expect(setCategoryDetectionInFlight).not.toHaveBeenCalledWith(true);
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('sets in-flight flag, fires detection, calls onDetected, then clears flag (async mode)', async () => {
    const onDetected = vi.fn();
    await triggerAutoCategoryDetection(baseSettings as never, undefined, onDetected);
    await new Promise((r) => setTimeout(r, 0)); // flush async-mode microtasks
    expect(setCategoryDetectionInFlight).toHaveBeenCalledWith(true);
    expect(setCategoryDetectionInFlight).toHaveBeenCalledWith(false);
    expect(onDetected).toHaveBeenCalledWith('News');
  });

  it('clears the in-flight flag even when the LLM returns Other (no onDetected)', async () => {
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ success: true, category: 'Other' }) },
    });
    const onDetected = vi.fn();
    await triggerAutoCategoryDetection(baseSettings as never, undefined, onDetected);
    await new Promise((r) => setTimeout(r, 0));
    expect(setCategoryDetectionInFlight).toHaveBeenCalledWith(false);
    expect(onDetected).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- content/utils/__tests__/pageContext.test.ts`
Expected: FAIL — `triggerAutoCategoryDetection` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add imports at top of `content/utils/pageContext.ts` (after existing `import type { PageContext, ExtensionSettings } from '@/types/config';`):

```ts
import {
  getAutoDetectedCategory,
  isCategoryDetectionInFlight,
  setCategoryDetectionInFlight,
} from '@/content/categoryState';
```

Add the helper after `detectLLMCategoryIfNeeded` (end of file, after line 173):

```ts
/**
 * Trigger an async LLM category detection if all of these hold:
 *  - LLM page-category detection is enabled
 *  - no manual override is set
 *  - no auto-detected value is already cached
 *  - no detection is already in flight
 *
 * The in-flight guard is set before dispatching and cleared on completion
 * (success, 'Other' result, or failure) so callers can fire-and-forget without
 * risking duplicate concurrent LLM calls for the same page.
 *
 * `onDetected` is invoked with the detected category (never 'Other').
 */
export async function triggerAutoCategoryDetection(
  settings: ExtensionSettings,
  manualOverride: string | undefined,
  onDetected: (category: string) => void,
): Promise<void> {
  if (!settings.enableLLMPageCategoryDetection) return;
  if (manualOverride) return;
  if (getAutoDetectedCategory()) return;
  if (isCategoryDetectionInFlight()) return;

  setCategoryDetectionInFlight(true);
  try {
    const pageContext = extractPageContext(document, settings.enableLLMPageCategoryDetection);
    await detectLLMCategoryIfNeeded(pageContext, settings, manualOverride, undefined, onDetected);
  } finally {
    // async mode resolves detectLLMCategoryIfNeeded before the inner .then runs;
    // blocking mode awaits it. Either way, by the time we reach here the LLM call
    // has settled (or no-oped). Clear the guard so a later lazy request can run if
    // this one produced nothing ('Other' / failure).
    setCategoryDetectionInFlight(false);
  }
}
```

Note: `detectLLMCategoryIfNeeded`'s `existingAutoDetected` arg is passed `undefined` (already checked above). Its async-mode `.then` runs *after* the await in `triggerAutoCategoryDetection` resolves, but the `onDetected` it eventually calls is safe (it just sets the singleton + broadcasts). The in-flight flag is cleared by the `finally` regardless of whether `onDetected` was called.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- content/utils/__tests__/pageContext.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add content/utils/pageContext.ts content/utils/__tests__/pageContext.test.ts
git commit -m "feat(pageContext): add triggerAutoCategoryDetection helper with in-flight guard"
```

---

### Task 3: Lazy detection on `getPageCategory` in content.ts

**Files:**
- Modify: `entrypoints/content.ts:14-20` (imports), `entrypoints/content.ts:459-471` (handler)
- Test: `entrypoints/__tests__/content.test.ts`

**Interfaces:**
- Consumes: `triggerAutoCategoryDetection` from `@/content/utils/pageContext`.
- Produces: `getPageCategory` handler now fires lazy detection as a side effect while still returning `llmDetected ?? heuristic` synchronously via `sendResponse`.

- [ ] **Step 1: Write the failing test**

Add a new `describe` block at the end of the top-level `describe('content.ts', ...)` in `entrypoints/__tests__/content.test.ts`. First extend the mock for `@/content/utils/pageContext` — replace the absent mock with an explicit one. Add after the other `vi.mock(...)` calls near the top (after `vi.mock('@/content/keyboardShortcuts');`):

```ts
const mockTriggerAutoCategoryDetection = vi.fn().mockResolvedValue(undefined);
vi.mock('@/content/utils/pageContext', () => ({
  extractPageContext: vi.fn(() => ({ title: '', description: '', domain: 'example.com' })),
  resolveCategory: vi.fn(),
  detectLLMCategoryIfNeeded: vi.fn(),
  triggerAutoCategoryDetection: mockTriggerAutoCategoryDetection,
  DOMAIN_CATEGORY_MAP: {},
}));
```

Also add a mock for categoryState (content.ts imports from it). Add alongside the others:

```ts
const mockGetAutoDetectedCategory = vi.fn(() => undefined);
vi.mock('@/content/categoryState', () => ({
  getAutoDetectedCategory: mockGetAutoDetectedCategory,
  setAutoDetectedCategory: vi.fn(),
  buildCategoryInfo: vi.fn(() => ({ autoDetected: undefined, siteRule: undefined, override: undefined, effective: undefined })),
  broadcastCategoryInfo: vi.fn(),
  isCategoryDetectionInFlight: vi.fn(() => false),
  setCategoryDetectionInFlight: vi.fn(),
}));
```

Then append the describe block at the end (before the closing `});` of the top describe):

```ts
  describe('getPageCategory lazy detection', () => {
    function findGetPageCategoryListener(): ((msg: { action: string }, sender: unknown, sendResponse: (r: unknown) => void) => boolean | undefined) | null {
      const calls = (chrome.runtime.onMessage.addListener as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      for (const call of calls) {
        const listener = call[0] as (msg: { action: string }, sender: unknown, sendResponse: (r: unknown) => void) => boolean | undefined;
        return listener ?? null;
      }
      return null;
    }

    beforeEach(() => {
      vi.mocked(loadSettings).mockResolvedValue({
        ...mockSettings,
        enableLLMPageCategoryDetection: true,
        enableContextAwareTranslation: true,
        llmCategoryDetectionMode: 'async',
        siteRules: [],
      } as ExtensionSettings);
      mockGetAutoDetectedCategory.mockReturnValue(undefined);
      mockTriggerAutoCategoryDetection.mockClear();
      mockTriggerAutoCategoryDetection.mockResolvedValue(undefined);

      const listeners: ((msg: { action: string }) => boolean | undefined)[] = [];
      global.chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue(undefined),
          onMessage: {
            addListener: vi.fn((l: (msg: { action: string }) => boolean | undefined) => { listeners.push(l); }),
            removeListener: vi.fn(),
          },
        },
      } as unknown as typeof chrome;
      // Stash the listeners array on the mock for retrieval
      (global.chrome.runtime.onMessage.addListener as unknown as { mock: { calls: unknown[][] } }).mock.calls = [];
      // Re-register the content script listener by importing fresh side-effects
    });

    it('fires triggerAutoCategoryDetection when singleton is empty and detection is enabled', async () => {
      // Dynamically import so setupMessageListener registers the listener under our chrome mock
      vi.resetModules();
      await import('../content');
      const listener = findGetPageCategoryListener();
      expect(listener).not.toBeNull();

      let response: unknown;
      await new Promise<void>((resolve) => {
        const ret = listener!({ action: 'getPageCategory' }, {}, (r: unknown) => { response = r; resolve(); });
        // handler returns true for async; flush
        if (ret !== true) resolve();
      });
      await Promise.resolve(); // let the async IIFE kick off
      await new Promise((r) => setTimeout(r, 0));

      expect(mockTriggerAutoCategoryDetection).toHaveBeenCalledTimes(1);
    });

    it('does NOT fire triggerAutoCategoryDetection when singleton already has a value', async () => {
      mockGetAutoDetectedCategory.mockReturnValue('News');
      vi.resetModules();
      await import('../content');
      const listener = findGetPageCategoryListener();

      await new Promise<void>((resolve) => {
        listener!({ action: 'getPageCategory' }, {}, () => resolve());
      });
      await new Promise((r) => setTimeout(r, 0));

      expect(mockTriggerAutoCategoryDetection).not.toHaveBeenCalled();
    });

    it('does NOT fire triggerAutoCategoryDetection when an override is set', async () => {
      // categoryOverride is module-level in content.ts; we cannot set it directly,
      // but triggerAutoCategoryDetection receives manualOverride from the handler.
      // The handler passes `categoryOverride` (module-scoped, defaults undefined).
      // To exercise the override path, we rely on the categoryChanged message setting it.
      vi.resetModules();
      const mod = await import('../content');
      const listener = findGetPageCategoryListener();

      // Simulate background forwarding a categoryChanged with an override
      await new Promise<void>((resolve) => {
        listener!({ action: 'categoryChanged', category: 'Gaming' }, {}, () => resolve());
      });
      await new Promise((r) => setTimeout(r, 0));

      await new Promise<void>((resolve) => {
        listener!({ action: 'getPageCategory' }, {}, () => resolve());
      });
      await new Promise((r) => setTimeout(r, 0));

      expect(mockTriggerAutoCategoryDetection).not.toHaveBeenCalled();
    });
  });
```

Note: the test for "override is set" uses the existing `categoryChanged` handler to populate the module-level `categoryOverride`, then issues `getPageCategory`. The handler's lazy call must check `categoryOverride` before firing.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- entrypoints/__tests__/content.test.ts`
Expected: FAIL — `triggerAutoCategoryDetection` is not called by the handler (currently it isn't invoked at all; the mock is unused).

- [ ] **Step 3: Write minimal implementation**

Update the import at `entrypoints/content.ts:14`:

```ts
import { extractPageContext, resolveCategory, detectLLMCategoryIfNeeded, triggerAutoCategoryDetection } from '@/content/utils/pageContext';
```

Replace the `getPageCategory` handler body (`entrypoints/content.ts:459-471`):

```ts
    } else if (message.action === 'getPageCategory') {
      // Return full category info to popup
      (async () => {
        const catSettings = await loadSettings();
        // Singleton holds only LLM-detected results; fall back to heuristic for display
        const llmDetected = getAutoDetectedCategory();
        const heuristic = catSettings.enableLLMPageCategoryDetection
          ? extractPageContext(document, true).category
          : undefined;
        const info = buildCategoryInfo(catSettings, categoryOverride);
        sendResponse({ ...info, autoDetected: llmDetected ?? heuristic });

        // Lazy LLM detection: when nothing is detected yet, detection is enabled,
        // and no manual override is set, kick off an async detection so the popup's
        // pageCategoryUpdate listener fills in the category shortly after open.
        if (!llmDetected && !heuristic && catSettings.enableLLMPageCategoryDetection && !categoryOverride) {
          triggerAutoCategoryDetection(catSettings, categoryOverride, (cat) => {
            setAutoDetectedCategory(cat);
            broadcastCategoryInfo(catSettings, categoryOverride);
          }).catch(() => {});
        }
      })();
      return true; // async response
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- entrypoints/__tests__/content.test.ts`
Expected: PASS (all tests, including new ones).

- [ ] **Step 5: Commit**

```bash
git add entrypoints/content.ts entrypoints/__tests__/content.test.ts
git commit -m "feat(content): lazy LLM category detection on getPageCategory"
```

---

### Task 4: Proactive detection in subtitle coordinator

**Files:**
- Modify: `content/subtitleCoordinator.ts:23-24` (imports), `content/subtitleCoordinator.ts:689-706` (`startCoordinator`), `content/subtitleCoordinator.ts:133-167` (refactor `buildSubtitlePageContext` to use the helper)
- Test: `content/__tests__/subtitleCoordinator.test.ts`

**Interfaces:**
- Consumes: `triggerAutoCategoryDetection` from `@/content/utils/pageContext`; `getAutoDetectedCategory` from `@/content/categoryState`.
- Produces: `startCoordinator()` schedules a debounced proactive detection when on a watch page.

- [ ] **Step 1: Write the failing test**

In `content/__tests__/subtitleCoordinator.test.ts`, extend the pageContext mock (currently at lines 76-84) to add `triggerAutoCategoryDetection`. Replace the existing `vi.mock('@/content/utils/pageContext', ...)` block with:

```ts
const mockTriggerAutoCategoryDetection = vi.fn().mockResolvedValue(undefined);
vi.mock('@/content/utils/pageContext', () => ({
  extractPageContext: (...args: unknown[]) => mockExtractPageContext(...args),
  resolveCategory: (...args: unknown[]) => mockResolveCategory(...args),
  detectLLMCategoryIfNeeded: (...args: unknown[]) => mockDetectLLMCategoryIfNeeded(...args),
  triggerAutoCategoryDetection: (...args: unknown[]) => mockTriggerAutoCategoryDetection(...args),
  DOMAIN_CATEGORY_MAP: {},
}));
```

Then add a new top-level `describe` block at the end of the file (outside the existing `describe('subtitleCoordinator – handleIntercepted translation path', ...)`):

```ts
describe('subtitleCoordinator – proactive category detection', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // YouTube watch page
    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.youtube.com', pathname: '/watch', href: 'https://www.youtube.com/watch?v=test123' },
      writable: true,
      configurable: true,
    });

    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      enableLLMPageCategoryDetection: true,
      enableContextAwareTranslation: true,
      llmCategoryDetectionMode: 'async',
      siteRules: [],
    });
    mockExtractPageContext.mockReturnValue({ title: 'Watch page', description: '', domain: 'www.youtube.com' });
    mockDetectLLMCategoryIfNeeded.mockResolvedValue(undefined);
    mockTriggerAutoCategoryDetection.mockClear();
    mockTriggerAutoCategoryDetection.mockResolvedValue(undefined);

    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ success: true, cues: MOCK_TRANSLATED_CUES }),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    } as unknown as typeof chrome;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('fires triggerAutoCategoryDetection on startCoordinator when on a watch page', async () => {
    const mod = await import('@/content/subtitleCoordinator');
    mod.startCoordinator();
    // debounce ~1500ms
    await new Promise((r) => setTimeout(r, 1700));
    expect(mockTriggerAutoCategoryDetection).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire proactive detection on a non-watch page (YouTube home)', async () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.youtube.com', pathname: '/', href: 'https://www.youtube.com/' },
      writable: true,
      configurable: true,
    });
    const mod = await import('@/content/subtitleCoordinator');
    mod.startCoordinator();
    await new Promise((r) => setTimeout(r, 1700));
    expect(mockTriggerAutoCategoryDetection).not.toHaveBeenCalled();
  });

  it('does NOT fire when LLM detection is disabled', async () => {
    mockLoadSettings.mockResolvedValue({
      ...MOCK_SETTINGS,
      enableLLMPageCategoryDetection: false,
      enableContextAwareTranslation: true,
      siteRules: [],
    });
    const mod = await import('@/content/subtitleCoordinator');
    mod.startCoordinator();
    await new Promise((r) => setTimeout(r, 1700));
    expect(mockTriggerAutoCategoryDetection).not.toHaveBeenCalled();
  });

  it('does NOT fire when a category override is already set (categoryChanged received)', async () => {
    const mod = await import('@/content/subtitleCoordinator');
    mod.startCoordinator();
    // Simulate a categoryChanged arriving before debounce fires
    const onMsgListener = (global.chrome.runtime.onMessage.addListener as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    // Find the coordinator's runtime listener (it filters on action)
    let coordinatorListener: ((m: { action: string; category?: string }) => void) | null = null;
    for (const call of onMsgListener) {
      const l = call[0] as (m: { action: string; category?: string }) => void;
      coordinatorListener = l;
      break;
    }
    if (coordinatorListener) coordinatorListener({ action: 'categoryChanged', category: 'Gaming' });
    await new Promise((r) => setTimeout(r, 1700));
    expect(mockTriggerAutoCategoryDetection).not.toHaveBeenCalled();
  });
});
```

Note: the last test relies on `startCoordinator` registering a `chrome.runtime.onMessage` listener that handles `categoryChanged` to set `state.categoryOverride`. The proactive trigger checks that override before firing.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- content/__tests__/subtitleCoordinator.test.ts`
Expected: FAIL — `triggerAutoCategoryDetection` is never called by `startCoordinator` (the mock is added but unused).

- [ ] **Step 3: Write minimal implementation**

Update the import at `content/subtitleCoordinator.ts:23`:

```ts
import { extractPageContext, resolveCategory, detectLLMCategoryIfNeeded, triggerAutoCategoryDetection } from '@/content/utils/pageContext';
```

Update `content/subtitleCoordinator.ts:24` to also import `getAutoDetectedCategory` if not already present (it is already imported):

```ts
import { setAutoDetectedCategory, broadcastCategoryInfo, getAutoDetectedCategory } from '@/content/categoryState';
```

Refactor the `onDetected` callback in `buildSubtitlePageContext` (`content/subtitleCoordinator.ts:139-148`) to use `triggerAutoCategoryDetection` for DRY (the shared helper already guards in-flight + override + existing autoDetected, so the explicit `getAutoDetectedCategory()` short-circuit inside `detectLLMCategoryIfNeeded` is preserved). Replace lines 139-148:

```ts
  await triggerAutoCategoryDetection(
    settings,
    state.categoryOverride,
    (cat) => {
      setAutoDetectedCategory(cat);
      broadcastCategoryInfo(settings, state.categoryOverride);
    },
  );
```

(Note: `buildSubtitlePageContext` previously also used `extractPageContext` to build the page context it returns — that call at line 137 stays. The detection is now delegated to `triggerAutoCategoryDetection`, which internally calls `extractPageContext` + `detectLLMCategoryIfNeeded`. The `pageContext` variable used downstream for `resolveCategory` is still the one from line 137.)

Add the proactive trigger inside `startCoordinator` (`content/subtitleCoordinator.ts:689-706`), right after the `console.log` at line 690:

```ts
export function startCoordinator(): () => void {
  console.log('AnyLLMTranslate: Starting subtitle coordinator');

  // Proactive LLM category detection on watch pages: fire once, debounced, so
  // the popup shows a detected category before the user presses play. The
  // trigger helper no-ops on disabled detection / existing override / existing
  // autoDetected / already-in-flight, so this is safe to schedule unconditionally.
  scheduleProactiveCategoryDetection();
```

Then add the helper function above `startCoordinator` (e.g. just before it, after the SPA navigation watcher helpers):

```ts
/** Debounce timer for proactive category detection on watch pages. */
let proactiveCategoryDetectionTimer: ReturnType<typeof setTimeout> | null = null;

/** Schedule a debounced proactive LLM category detection on subtitle watch pages.
 *  No-ops (via triggerAutoCategoryDetection's guards) when not applicable. */
function scheduleProactiveCategoryDetection(): void {
  if (proactiveCategoryDetectionTimer) {
    clearTimeout(proactiveCategoryDetectionTimer);
  }
  proactiveCategoryDetectionTimer = setTimeout(() => {
    proactiveCategoryDetectionTimer = null;
    if (!isOnWatchPage()) return;
    void (async () => {
      const settings = await loadSettings();
      if (!settings.enableContextAwareTranslation) return;
      if (!settings.enableLLMPageCategoryDetection) return;
      // state.categoryOverride and the singleton are checked inside the helper.
      await triggerAutoCategoryDetection(settings, state.categoryOverride, (cat) => {
        setAutoDetectedCategory(cat);
        broadcastCategoryInfo(settings, state.categoryOverride);
      });
    })();
  }, 1500);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- content/__tests__/subtitleCoordinator.test.ts`
Expected: PASS (all tests, including new proactive detection tests and existing `handleIntercepted` tests after the `buildSubtitlePageContext` refactor).

- [ ] **Step 5: Commit**

```bash
git add content/subtitleCoordinator.ts content/__tests__/subtitleCoordinator.test.ts
git commit -m "feat(subtitle): proactive LLM category detection on watch pages"
```

---

### Task 5: Full test suite + typecheck + lint

**Files:** none (verification only)

- [ ] **Step 1: Run the targeted test files**

Run: `pnpm test -- content/__tests__/categoryState.test.ts content/utils/__tests__/pageContext.test.ts content/__tests__/subtitleCoordinator.test.ts entrypoints/__tests__/content.test.ts`
Expected: PASS for all four files.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: PASS (no regressions).

- [ ] **Step 3: Typecheck**

Run: `pnpm compile`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: no errors (fix any with `pnpm lint --fix` if trivial).

- [ ] **Step 5: Commit if any fixups were needed**

```bash
git add -A
git commit -m "chore: verify popup category detection timing"
```

Otherwise no commit (verification-only step).

---

## Self-Review

**Spec coverage:**
- Regular pages lazy on popup open → Task 3 (`getPageCategory` fires `triggerAutoCategoryDetection`). ✓
- Subtitle watch pages proactive on load → Task 4 (`scheduleProactiveCategoryDetection` in `startCoordinator`). ✓
- Subtitle pages fallback on popup open → covered by the regular-page lazy path in Task 3 (the popup query goes to the content script regardless of page type; the coordinator's proactive call and the lazy call share the in-flight guard). ✓
- In-flight guard in `categoryState.ts` → Task 1. ✓
- Shared `triggerAutoCategoryDetection` helper used by both new triggers + `buildSubtitlePageContext` → Task 2 + Task 4 refactor. ✓
- Error handling (in-flight flag cleared on success + failure) → Task 2 `finally` + tests. ✓
- Testing (in-flight single-call, proactive no-ops, flag cleared on both paths) → Tasks 1-4 tests. ✓

**Placeholder scan:** No TBD/TODO. Every code step contains complete code.

**Type consistency:** `triggerAutoCategoryDetection(settings, manualOverride, onDetected)` signature used identically in Task 3, Task 4's `buildSubtitlePageContext` refactor, and Task 4's `scheduleProactiveCategoryDetection`. `isCategoryDetectionInFlight`/`setCategoryDetectionInFlight` defined in Task 1 and consumed in Task 2. `_resetCategoryState` updated consistently.