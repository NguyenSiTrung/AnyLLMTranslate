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

## Implementation Learnings

### Custom Theme Builder
- CSS custom properties (`--anyllm-custom-*`) on `<html>` are the cleanest way to inject dynamic theme values into content script styles without shadow DOM complexity.
- When `border-style: none`, the CSS rule must explicitly set `border-left-width: 0` and `padding-left: 0` to avoid leftover visual artifacts.
- `useMemo` with a CSSProperties cast (`as React.CSSProperties`) safely injects CSS custom properties into the ThemePreview container for live preview updates.
- Color picker inputs require paired text inputs for accessibility and precise value entry.

### Context-Aware Translation
- `PageContext` extraction should be <10ms: only DOM queries (title, meta description, hostname), zero network calls.
- Domain-to-category heuristic map is sufficient for ~30 top domains; no LLM call needed for detection.
- `buildSystemPrompt()` signature extension with optional `pageContext` preserves backward compatibility for all existing callers (subtitle translation, selection translation).
- Only append the context block when at least one field is non-empty to avoid adding noise to the prompt.
- A parent toggle (`enableContextAwareTranslation`) should gate the entire feature, with category detection as a visually-nested sub-toggle (grayed out via `opacity-40 pointer-events-none`) when parent is off.

## Gotchas
- ESLint `no-non-null-assertion` forbids `element!` in tests — use `if (element)` guard instead.
- Adding new fields to `ExtensionSettings` requires updating `extractSettings()` in the Zustand store, otherwise persistence/export silently drops the new fields.
- The `TranslationRequest` interface change requires updating `services/openaiCompatible.ts` to pass the new field through to `buildSystemPrompt()`.
- `chrome.runtime.sendMessage` payload extension (adding `pageContext`) is backward compatible because the background `handleMessage` receives it as an optional property.
- When changing description text in UI components, corresponding test assertions must be updated to match.

## Test Coverage
- 673 tests passing across 53 files (up from 526/42 at track start).
- New test files: `CustomThemeEditor.test.tsx`, `ThemesSection.test.tsx`, `pageContext.test.ts`.
- Updated existing tests: `ThemePreview.test.tsx`, `base.test.ts`, `config.test.ts`, `translationDisplay.test.ts`, `themes.test.ts`, `AdvancedSection.test.tsx`.

## Build Health
- `pnpm test`: 673/673 passing
- `pnpm lint`: 0 errors, 0 warnings
