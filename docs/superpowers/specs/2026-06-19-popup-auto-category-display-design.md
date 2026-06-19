# Popup "Auto (Category)" Display — Design

**Date:** 2026-06-19
**Status:** Approved (pending spec review)
**Topic:** Show what category Auto-detect resolved to in the popup, on every page including subtitle pages.

## Problem

When category detection is set to **Auto**, the popup should show what was detected — e.g. `Auto (News)` — so the user can see the resolved category without opening the dropdown. Today this never happens reliably.

### Root cause

LLM **auto-detection** and a **manual user pick** both flow through the same `setCategoryOverride` message path:

```
detectLLMCategoryIfNeeded (content/utils/pageContext.ts)
  → chrome.runtime.sendMessage({ action: 'setCategoryOverride', category })
  → services/background.ts storeCategoryOverride(tabId, category)
  → entrypoints/content.ts categoryOverride = message.category

handleCategoryChange (popup/App.tsx)
  → chrome.runtime.sendMessage({ action: 'setCategoryOverride', category })
  → (same path)
```

The popup computes:

```ts
const currentCategoryValue = categoryInfo?.override ?? categoryInfo?.siteRule ?? '__auto__';
```

So once Auto detects a category, `categoryInfo.override` is set, `currentCategoryValue` is no longer `'__auto__'`, and the `Auto (…)` display branch is skipped. The popup shows the **bare category name**, losing the "Auto is active" signal.

The `CategoryInfo.autoDetected` field already exists but is only populated by cheap heuristics in `extractPageContext`, never by the LLM result.

## Goal

Show the resolved category inline in the popup whenever Auto mode is active and a category has been detected, on every page including subtitle/video pages (the popup is shared).

## Non-goals

- No separate subtitle-specific category indicator (the shared popup covers it).
- No changes to the actual translation prompt or category priority for translation — only the **display** and the **data plumbing** that feeds it.
- No persistence of LLM-detected category across reloads (matches current behavior).

## Approach

Separate **auto-detected** from **manual override** instead of conflating them through one override slot. This matches the already-documented priority chain (`temp override > siteRule > autoDetect`) and reuses the existing `CategoryInfo.autoDetected` field for its intended purpose.

Rejected alternative: tag the single override store with `overrideIsAuto: boolean`. Muddier semantics (an "override" that isn't really one) and touches the store + content + popup + types anyway.

## Design

### 1. `content/utils/pageContext.ts` — refactor `detectLLMCategoryIfNeeded`

Remove the `setCategoryOverride` side-effect (both blocking and async branches). Add parameters so callers can decide what to do with the result:

```ts
export async function detectLLMCategoryIfNeeded(
  pageContext: PageContext,
  settings: ExtensionSettings,
  manualOverride: string | undefined,
  existingAutoDetected: string | undefined,
  onDetected: (category: string) => void,
): Promise<void>
```

- Still early-returns when `!settings.enableLLMPageCategoryDetection`, when `manualOverride` is set, or when `existingAutoDetected` is set (avoid re-detecting).
- Blocking mode: await `DETECT_PAGE_CATEGORY_LLM`; on `success && category && category !== 'Other'`, set `pageContext.category` and call `onDetected(category)`.
- Async mode: fire-and-forget; on success call `onDetected(category)`.

This keeps the function pure of the global override store.

### 2. `content/categoryState.ts` — shared auto-detected state (NEW)

Both `entrypoints/content.ts` and `content/subtitleCoordinator.ts` run LLM category detection independently (page translation vs. subtitle translation). Since they share one content-script context and the popup queries `content.ts` via `getPageCategory`, the auto-detected value must be shared so the popup reflects subtitle-page detection too.

A tiny singleton module holds the auto-detected category and a broadcast helper:

```ts
// content/categoryState.ts
export function getAutoDetectedCategory(): string | undefined;
export function setAutoDetectedCategory(category: string | undefined): void;
export function buildCategoryInfo(settings, tabOverride): CategoryInfo;
export function broadcastCategoryInfo(settings, tabOverride): void;
```

`buildCategoryInfo` centralizes the `resolveCategory(autoDetected, siteRule, override)` + `findMatchingRule` logic currently duplicated in both call sites, and `broadcastCategoryInfo` sends `{ action: 'pageCategoryUpdate', categoryInfo }`.

### 3. `entrypoints/content.ts` — use shared state

- Import `getAutoDetectedCategory`, `setAutoDetectedCategory`, `buildCategoryInfo`, `broadcastCategoryInfo` from `@/content/categoryState`.
- On page translation start, call the refactored `detectLLMCategoryIfNeeded` with:
  - `manualOverride = categoryOverride`
  - `existingAutoDetected = getAutoDetectedCategory()`
  - `onDetected = (cat) => { setAutoDetectedCategory(cat); broadcastCategoryInfo(settings, categoryOverride); }`
- `getPageCategory` handler: compute `autoDetected = getAutoDetectedCategory() ?? extractPageContext(document, true).category` (prefer the LLM result if known; fall back to heuristic), then return `buildCategoryInfo(settings, categoryOverride)`.
- `categoryChanged` handler: after updating `categoryOverride`, call `broadcastCategoryInfo(settings, categoryOverride)` so the popup refreshes on manual change too.

`categoryOverride` retains its meaning: **temporary, user-driven** choice only.

### 4. `content/subtitleCoordinator.ts` — use shared state

- Update the `detectLLMCategoryIfNeeded` call in `buildSubtitlePageContext` to the new signature with `onDetected = (cat) => { setAutoDetectedCategory(cat); broadcastCategoryInfo(settings, state.categoryOverride); }`.
- The subtitle translation's own `resolveCategory` logic is unchanged (still uses `state.categoryOverride` + heuristic `pageContext.category`); only the LLM-detection side-effect moves to the shared module so the popup can see it.

### 5. `types/messages.ts` — new message

Add `'pageCategoryUpdate'` to `MessageAction`. Add:

```ts
export interface PageCategoryUpdateMessage {
  action: 'pageCategoryUpdate';
  categoryInfo: CategoryInfo;
}
```

Add to the `ExtensionMessage` union.

### 6. `entrypoints/popup/App.tsx` — display + live refresh

- Pass `categoryInfo?.autoDetected` to `CategoryPicker` as `detectedCategory` (rename current prop `effectiveCategory` → `detectedCategory`).
- Display logic in `CategoryPicker`:
  - Trigger label when `currentValue === '__auto__'`:
    - `Auto` if no `detectedCategory`
    - `Auto (${detectedCategory})` when detected (parentheses, per user preference)
  - "Auto Detect" row inside the dropdown shows the same `Auto (${detectedCategory})` form when selected.
- In `App`, extend the existing `messageListener` to handle `'pageCategoryUpdate'`: `setCategoryInfo(message.categoryInfo)`. This makes the popup update live while open as Auto-detection finishes.

### 7. Tests

- `content/categoryState.test.ts` (new): unit-test `setAutoDetectedCategory`/`getAutoDetectedCategory`, `buildCategoryInfo` priority chain, `broadcastCategoryInfo` sends the right message.
- `content/utils/__tests__/pageContext.test.ts` (extended): unit-test the refactored `detectLLMCategoryIfNeeded` — early-return when manual override is set, early-return when `existingAutoDetected` is set, calls `onDetected` with the LLM category in both blocking and async modes, ignores `'Other'`.
- `content/__tests__/subtitleCoordinator.test.ts`: the existing `(...args) => mock(...)` mock already accepts any arity, so no signature change is needed — but verify tests still pass.
- Manual smoke test: open a known-domain page (e.g. a Wikipedia article), enable Page Category Detection, open popup, confirm `Auto (Encyclopedia)` appears and updates live without opening the dropdown.

## Behavior matrix

| Mode | Popup shows |
|------|-------------|
| Auto, nothing detected yet | `Auto` |
| Auto, detected "News" | `Auto (News)` |
| Manual pick "News" | `News` |
| Site rule "News" | `News` |
| Site rule "News", Auto also detected "News" | `News` (rule wins) |

## Files touched

- `content/categoryState.ts` (new — shared singleton)
- `content/utils/pageContext.ts` (refactor `detectLLMCategoryIfNeeded`)
- `entrypoints/content.ts` (use shared state, getPageCategory, broadcast)
- `content/subtitleCoordinator.ts` (use shared state + new signature)
- `types/messages.ts` (new message type)
- `entrypoints/popup/App.tsx` (display + listener)
- `content/categoryState.test.ts` (new unit tests)
- `content/utils/__tests__/pageContext.test.ts` (new unit tests for refactored fn)

## Risk

- The broadcast adds one more `chrome.runtime.sendMessage` per detection. Negligible (fires once per page translation start, not per cue).
- Removing the override side-effect from `detectLLMCategoryIfNeeded` is the only behavior change to translation itself; the resolved `pageContext.category` still reaches the background with the same effective value (auto-detected category), so prompts are unchanged.
