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

### 2. `entrypoints/content.ts` — track auto-detected separately

- New module-level state: `let autoDetectedCategory: string | undefined;`
- On page translation start, call the refactored `detectLLMCategoryIfNeeded` with:
  - `manualOverride = categoryOverride`
  - `existingAutoDetected = autoDetectedCategory`
  - `onDetected = (cat) => { autoDetectedCategory = cat; broadcastCategoryInfo(); }`
- `getPageCategory` handler: compute `autoDetected = autoDetectedCategory ?? extractPageContext(document, true).category` (prefer the LLM result if known; fall back to heuristic).
- New helper `broadcastCategoryInfo()` that builds the full `CategoryInfo` (autoDetected, siteRule, override, effective) and sends `{ action: 'pageCategoryUpdate', categoryInfo }` via `chrome.runtime.sendMessage`. Called after detection and after any `categoryChanged`/override mutation so the popup stays in sync.

`categoryOverride` retains its meaning: **temporary, user-driven** choice only.

### 3. `types/messages.ts` — new message

Add `'pageCategoryUpdate'` to `MessageAction`. Add:

```ts
export interface PageCategoryUpdateMessage {
  action: 'pageCategoryUpdate';
  categoryInfo: CategoryInfo;
}
```

Add to the `ExtensionMessage` union.

### 4. `entrypoints/popup/App.tsx` — display + live refresh

- Pass `categoryInfo?.autoDetected` to `CategoryPicker` as `detectedCategory` (rename current prop `effectiveCategory` → `detectedCategory`).
- Display logic in `CategoryPicker`:
  - Trigger label when `currentValue === '__auto__'`:
    - `Auto` if no `detectedCategory`
    - `Auto (${detectedCategory})` when detected (parentheses, per user preference)
  - "Auto Detect" row inside the dropdown shows the same `Auto (${detectedCategory})` form when selected.
- In `App`, extend the existing `messageListener` to handle `'pageCategoryUpdate'`: `setCategoryInfo(message.categoryInfo)`. This makes the popup update live while open as Auto-detection finishes.

### 5. Tests

- `content/__tests__/subtitleCoordinator.test.ts`: update the `detectLLMCategoryIfNeeded` mock signature to match the new params.
- `content/utils/__tests__/pageContext.test.ts` (new or extended): unit-test the refactored function — early-return when manual override is set, early-return when `existingAutoDetected` is set, calls `onDetected` with the LLM category in both blocking and async modes, ignores `'Other'`.
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

- `content/utils/pageContext.ts` (refactor)
- `entrypoints/content.ts` (new state, broadcast, getPageCategory tweak)
- `types/messages.ts` (new message type)
- `entrypoints/popup/App.tsx` (display + listener)
- `content/__tests__/subtitleCoordinator.test.ts` (mock signature)
- `content/utils/__tests__/pageContext.test.ts` (new unit tests)

## Risk

- The broadcast adds one more `chrome.runtime.sendMessage` per detection. Negligible (fires once per page translation start, not per cue).
- Removing the override side-effect from `detectLLMCategoryIfNeeded` is the only behavior change to translation itself; the resolved `pageContext.category` still reaches the background with the same effective value (auto-detected category), so prompts are unchanged.
