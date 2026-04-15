# Track Learnings: display-mode-fix_20260416

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- `data-anyllm-state` attribute on `<html>` drives all display mode CSS via `inject.css` — only one attribute controls dual/translation-only/off visibility.
- `chrome.storage.onChanged` listener in `initInteractionFeatures()` is the existing pattern for live-applying settings changes to active translations (theme, translationPosition, darkMode all follow this pattern).
- `DisplayMode` (`'bilingual-below' | 'translation-only'`) ≠ `PageState` (`'dual' | 'translation-only' | 'off'`) — these are two separate types. The mapping is: `bilingual-below → dual`, `translation-only → translation-only`.
- `loadSettings()` in `entrypoints/content.ts` reads from `chrome.storage.local` — already called at the top of `startTranslation()`, so `settings` is available without an extra load call.
- `togglePageState()` in `translationDisplay.ts` is called by `toggleTranslation()` in content.ts (via the `toggle-display` chrome.command handler chain).

---

<!-- Learnings from implementation will be appended below -->
