# Track Learnings: theme-context_20260422

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### Theme System
- Attribute scoping: `[data-anyllm-theme="name"]` on `<html>` cleanly scopes themes without class conflicts.
- Theme CSS uses `[data-anyllm-theme]` attribute on container for scoping.
- Dark mode supported via `html.anyllm-dark` class and `@media (prefers-color-scheme: dark)`.
- Theme preview requires importing actual theme CSS (`styles/inject.css`) into options page for accurate preview.
- Component uses `useSettingsStore()` for automatic reactivity to theme changes.
- Light/dark mode toggle applies `anyllm-dark` class to preview container for CSS scoping.
- Use string union types (not enums) for `ThemeName` — keeps bundle small and enables exhaustive matching.
- `styles/__tests__/themes.test.ts` checks inject.css as a raw string — when adding CSS rules, always update themes.test.ts alongside the CSS file.
- CSS keyframe names, custom properties, and selectors must match the `anyllm-` prefix system.
- Always provide CSS custom property fallbacks in inject.css: `var(--anyllm-accent, #3b82f6)`.

### Prompt System
- Variable injection (`{{targetLanguage}}`, `{{glossary}}`) via regex replace is backward compatible with existing `buildSystemPrompt(lang)` calls.
- `buildSystemPrompt()` already accepted optional params — always check existing function signatures before extending.
- `buildSystemPrompt` and `buildUserPrompt` now format language codes as `"Full Name (code)"` — tests must use the full display format.

### Settings & State
- Zustand + chrome.storage bidirectional sync: write on mutation, listen via `chrome.storage.onChanged`.
- Deep merge for nested settings objects — handle separately to avoid losing fields on partial updates.
- Auto-save on blur eliminates need for explicit save button.
- Need local state for inputs to allow typing without immediately updating settings store.

### UI Components
- Shared UI library: `ui/` at project root, not inside entrypoints.
- No barrel export: Import directly from `@/ui/ComponentName`.
- Merging cards uses `border-t border-zinc-800 pt-4` as visual divider within a single Card.

---

<!-- Learnings from implementation will be appended below -->
