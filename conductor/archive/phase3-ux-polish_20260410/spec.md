# Spec: Phase 3 — UX Polish & LLM Provider

## Overview

Deliver the premium user experience layer for LinguaLens: 15+ visual translation themes, a comprehensive Options page with provider configuration, custom system prompt editor, site rules editor, glossary/dictionary management, and polished loading/error states. This phase transforms the functional foundation (Phase 1-2) into a user-ready product.

## Functional Requirements

### FR1: Visual Theme System (15+ Themes)
- Implement 15+ translation display themes as CSS Custom Property sets in `styles/inject.css`
- Themes selected via `data-lingua-theme` attribute on `<html>` element
- Theme list: Dividing Line (existing), Blockquote, Paper, Underline, Dashed Underline, Highlight, Wavy Underline, Bubble/Tooltip, Side-by-Side, Mask/Blur, Fade-In, Italic, Dotted Border, Shadow Card, Minimal, Gradient Accent
- Each theme includes both light and dark mode variants
- Theme state managed in Zustand store, synced to `chrome.storage.local`
- Content script reads theme on init and listens for `storage.onChanged`
- Theme switching must be <100ms (CSS variable swap only)

### FR2: Dark Mode Support
- Full `prefers-color-scheme: dark` support via CSS Custom Properties
- All themes define both `--lingua-*` light and dark variable sets
- Manual dark/light/auto toggle in Options page
- Dark mode applies to extension UI (popup, options) via Tailwind dark mode AND to host-page translations via CSS media queries

### FR3: Provider Validation ("Test Connection")
- "Test Connection" button on Provider settings section
- Validation pipeline:
  1. Simple ping — send minimal `"Hello"` request to API, verify 200
  2. Model listing — call `/v1/models` endpoint, populate model dropdown
  3. Translation test — translate sample sentence, show result
  4. Latency display — show response time for each step
- API key masking — display `sk-...xxxx` in all UI surfaces, never expose full key
- Visual feedback: spinner during test, green check on success, red X with error message on failure

### FR4: Custom System Prompt Editor
- Textarea in Provider settings showing the full system prompt template
- Auto-injected variables: `{{targetLanguage}}`, `{{glossary}}`
- Variables highlighted/badged in the editor for visibility
- "Reset to Default" button to restore built-in prompt
- Warning indicator if user removes critical rules (e.g., JSON format instruction)
- Prompt stored in `chrome.storage.local`, used by `buildSystemPrompt()` at runtime

### FR5: Enhanced Popup UI
- Extend existing React popup with:
  - Theme selector dropdown (all 15+ themes)
  - Translation position toggle (Below / Above / Side)
  - Subtitle controls (font size, toggle)
  - Provider quick-switch
  - "Open Settings" link to Options page
- Popup state synced with Options page via shared Zustand/chrome.storage

### FR6: Options Page (Vertical Tabbed Layout)
- New WXT entrypoint: `entrypoints/options/`
- 8 tabbed sections with vertical sidebar navigation:
  1. **General** — Target language, default display mode, theme selector with live preview
  2. **Translation Provider** — Base URL, API key (masked), model selector, presets dropdown (OpenAI/DeepSeek/Groq/Ollama/LM Studio/vLLM), Test Connection, system prompt editor
  3. **Display Themes** — Live preview gallery of all 15+ themes, click to select
  4. **Site Rules** — Per-site settings list, always/never translate toggle, custom selector overrides
  5. **Custom Dictionary** — Glossary CRUD (source term → target translation), import/export
  6. **Subtitles** — Default subtitle position, font size slider, opacity control
  7. **Keyboard Shortcuts** — Customizable keybindings display (links to `chrome://extensions/shortcuts`)
  8. **Advanced** — Cache stats & clear, export/import all settings as JSON, debug mode toggle
- Built with React + Tailwind CSS (extension-owned UI)
- All settings persisted to `chrome.storage.local`

### FR7: Site Rules Editor UI
- List of current site rules (built-in + custom)
- Add/edit/delete custom rules
- Per-rule fields: hostname pattern, CSS selectors, exclude selectors, always/never translate
- Built-in rules shown as read-only with override capability
- Search/filter by hostname

### FR8: Custom Dictionary/Glossary
- CRUD interface for glossary entries (source term ↔ translated term)
- Entries stored in `chrome.storage.local`
- Glossary terms injected into system prompt via `{{glossary}}` variable
- Import/export as JSON or CSV
- Entries applied during translation as term protection

### FR9: Loading & Error State UX
- CSS loading animation on paragraphs being translated (`data-lingua-loading` attribute)
- Shimmer/pulse loading bar below elements awaiting translation
- Error state with red left border and "⚠ Translation failed" indicator
- Retry button on failed translations
- Error details accessible via hover/click

## Non-Functional Requirements

- **Performance**: Theme switching <100ms, Options page load <500ms
- **Bundle size**: Options page <200KB additional
- **Accessibility**: All settings keyboard-navigable, ARIA labels on interactive elements
- **Persistence**: All settings survive browser restart via `chrome.storage.local`
- **Isolation**: Extension CSS must not pollute host pages; host page CSS must not affect extension UI

## Acceptance Criteria

1. All 15+ themes render correctly on 5+ test sites (Wikipedia, GitHub, Medium, Reddit, HN)
2. Dark mode auto-detects and switches correctly for both themes and extension UI
3. "Test Connection" validates provider, shows latency, lists models, and runs sample translation
4. System prompt editor shows template with variables, auto-injects `{{targetLanguage}}` and `{{glossary}}`
5. Options page loads all 8 sections, settings persist across browser restart
6. Site rules editor can add/edit/delete custom rules
7. Custom glossary entries appear in translated output (term protection)
8. Loading and error states visible and functional
9. All new modules have ≥80% test coverage
10. Build succeeds with `pnpm build`, no lint errors

## Out of Scope

- E2E tests with Playwright (Phase 4)
- Text selection translate popup (Phase 4)
- Mouse hover translate (Phase 4)
- Side panel reading view (Phase 4)
- Netflix subtitle handler (Phase 4)
- Keyboard shortcut binding (Phase 4 — Options page shows link to `chrome://extensions/shortcuts`)
