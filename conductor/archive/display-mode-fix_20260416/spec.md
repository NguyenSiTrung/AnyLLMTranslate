# Spec: Fix Display Mode — Wire `displayMode` Setting to Page State

## Overview

The `displayMode` setting (`'bilingual-below'` | `'translation-only'`) is stored in
chrome.storage and exposed in the popup/options UI, but is never read by the content
script. As a result, the "Replace" mode (translation-only) never activates — all
translations render in bilingual mode regardless of the user's setting.

Three root defects identified:
1. `startTranslation()` hardcodes `setPageState('dual')`, ignoring `settings.displayMode`
2. The `chrome.storage.onChanged` listener doesn't react to `displayMode` changes while translation is active
3. `togglePageState()` cycles `off → dual → off`, never visiting `translation-only`

A bonus pre-existing issue: `AdvancedSection.test.tsx` uses `displayMode: 'dual'` which
is a `PageState` value, not a valid `DisplayMode` (`'bilingual-below' | 'translation-only'`).

## Functional Requirements

### FR-1: Apply displayMode on Translation Start
`startTranslation()` in `entrypoints/content.ts` must read `settings.displayMode`
and map it to the correct `PageState`:
- `'bilingual-below'` → `setPageState('dual')`
- `'translation-only'` → `setPageState('translation-only')`

### FR-2: Live-Update displayMode While Translation is Active
The `chrome.storage.onChanged` listener in `initInteractionFeatures()` must handle
`displayMode` changes and apply the new page state immediately — but only if
translation is currently active (`getPageState() !== 'off'`). No re-translation
or DOM rebuild required; it is a pure CSS attribute flip.

### FR-3: Keyboard Shortcut Respects displayMode
`togglePageState()` in `content/translationDisplay.ts` must accept an optional
`displayMode` parameter to decide the "on" state:
- From `'off'` → `displayMode === 'translation-only'` ? `'translation-only'` : `'dual'`
- From `'dual'` or `'translation-only'` → `'off'`

The call-site in `entrypoints/content.ts` (`toggleTranslation()`) must load settings
and pass `settings.displayMode` to `togglePageState()`.

### FR-4: Fix Test Type Mismatch
`entrypoints/options/__tests__/AdvancedSection.test.tsx` must use valid `DisplayMode`
values. Replace `displayMode: 'dual'` with `displayMode: 'bilingual-below'`.

## Non-Functional Requirements

- No new LLM API calls for live displayMode changes (pure DOM attribute change)
- No regression to existing theme/position/darkMode live-update behavior
- All changes must be lint-clean (`pnpm lint`) and type-safe (no `any`)

## Acceptance Criteria

- [ ] Starting translation with `displayMode: 'translation-only'` sets `data-anyllm-state="translation-only"` on `<html>`
- [ ] Starting translation with `displayMode: 'bilingual-below'` sets `data-anyllm-state="dual"` on `<html>`
- [ ] Changing `displayMode` in popup while translation is active immediately updates page state (no restart needed)
- [ ] Changing `displayMode` while translation is OFF does not affect page state
- [ ] Keyboard shortcut (`toggle-display`) toggles to `translation-only` when `displayMode: 'translation-only'` is configured
- [ ] Keyboard shortcut toggles to `dual` when `displayMode: 'bilingual-below'` is configured
- [ ] `AdvancedSection.test.tsx` uses only valid `DisplayMode` values
- [ ] All existing 459 tests pass (no regressions)
- [ ] Lint-clean

## Out of Scope

- Persisting `PageState` independently of `displayMode` (they remain in sync via settings)
- Adding a three-state keyboard toggle cycle (dual → translation-only → off)
- Any subtitle-related display mode changes
- Adding new `displayMode` values beyond the two existing ones
