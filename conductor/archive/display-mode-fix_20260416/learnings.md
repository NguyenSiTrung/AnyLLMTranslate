# Track Learnings: display-mode-fix_20260416

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- `data-anyllm-state` attribute on `<html>` drives all display mode CSS via `inject.css` — only one attribute controls dual/translation-only/off visibility.
- `chrome.storage.onChanged` listener in `initInteractionFeatures()` is the existing pattern for live-applying settings changes to active translations (theme, translationPosition, darkMode all follow this pattern).
- `DisplayMode` (`'bilingual-below' | 'translation-only'`) ≠ `PageState` (`'dual' | 'translation-only' | 'off'`) — these are two separate types. The mapping is: `bilingual-below → dual`, `translation-only → translation-only`.
- `loadSettings()` in `entrypoints/content.ts` reads from `chrome.storage.local` — already called at the top of `startTranslation()`, so `settings` is available without an extra load call.
- `togglePageState()` in `translationDisplay.ts` is called by `toggleTranslation()` in content.ts (via the `toggle-display` chrome.command handler chain).

---

## [2026-04-16 01:13] - Phase 1 Task 1 & 2: Core Fix
- **Implemented:** Updated `startTranslation` and `initInteractionFeatures` to respect `displayMode` setting.
- **Files changed:** `entrypoints/content.ts`, `entrypoints/__tests__/content.test.ts`
- **Commit:** 16f04f9
- **Learnings:**
  - Gotchas: When `setPageState('off')` is called, it explicitly sets the `data-anyllm-state` attribute to `"off"`, it doesn't remove it. Test assertions must expect `'off'`, not `null`.

## [2026-04-16 01:15] - Phase 2 Task 3 & 4: Keyboard Shortcut Fix
- **Implemented:** Updated `togglePageState` to accept an optional `displayMode` argument.
- **Files changed:** `content/translationDisplay.ts`, `content/__tests__/translationDisplay.test.ts`
- **Commit:** b1be0f5
- **Learnings:**
  - `togglePageState` is not actively used in production code anymore (it is superseded by explicit state handling in `startTranslation` and `stopTranslation` from the content script), but kept its logic up to date per spec.

## [2026-04-16 01:17] - Phase 3 Task 5: Test Cleanup
- **Implemented:** Fixed invalid `displayMode` value `dual` to `bilingual-below` in `AdvancedSection.test.tsx`.
- **Files changed:** `entrypoints/options/__tests__/AdvancedSection.test.tsx`
- **Commit:** <latest>
- **Learnings:**
  - TypeScript types correctly distinguish `displayMode` (`'bilingual-below'` | `'translation-only'`) and `pageState` (`'dual'` | `'translation-only'` | `'off'`). Tests mock stores need to use correct settings type values.

<!-- Learnings from implementation will be appended below -->
