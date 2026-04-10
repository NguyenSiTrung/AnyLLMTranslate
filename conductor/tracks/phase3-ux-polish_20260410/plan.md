# Plan: Phase 3 — UX Polish & LLM Provider

## Phase 1: Theme System & Settings Store
<!-- execution: sequential -->
<!-- depends: -->

- [x] Task 1: Extend type system for themes, site rules, glossary, and settings (0e87cb1)
  <!-- files: types/config.ts -->
  - [x] Add `ThemeName` union type (16 theme IDs) to `types/config.ts`
  - [x] Add `TranslationPosition` type ('below' | 'above' | 'side')
  - [x] Add `SiteRule` interface to `types/config.ts`
  - [x] Add `GlossaryEntry` interface to `types/config.ts`
  - [x] Add `SubtitleSettings` interface to `types/config.ts`
  - [x] Extend `ExtensionSettings` with theme, position, glossary, siteRules, subtitleSettings, customSystemPrompt, darkMode fields
  - [x] Update `DEFAULT_SETTINGS` with new defaults
  - [x] Write unit tests for type exports and defaults

- [x] Task 2: Create Zustand settings store with chrome.storage sync (0e87cb1)
  <!-- files: stores/settingsStore.ts, stores/__tests__/settingsStore.test.ts -->
  <!-- depends: task1 -->
  - [x] Create `stores/settingsStore.ts` — Zustand store wrapping `ExtensionSettings`
  - [x] Implement `chrome.storage.local` read on init, write on change
  - [x] Implement `chrome.storage.onChanged` listener for cross-context sync
  - [x] Export typed hooks: `useSettings()`, `useTheme()`, `useProvider()`
  - [x] Write unit tests for store init, persistence, and sync logic

- [x] Task 3: Implement 15+ CSS themes in inject.css (0e87cb1)
  <!-- files: styles/inject.css, styles/__tests__/themes.test.ts -->
  <!-- depends: task1 -->
  - [x] Define CSS Custom Property sets for each theme, scoped by `[data-lingua-theme="<name>"]`
  - [x] Themes: dividing-line (existing), blockquote, paper, underline, dashed-underline, highlight, wavy-underline, bubble, side-by-side, mask, fade-in, italic, dotted-border, shadow-card, minimal, gradient-accent
  - [x] Each theme defines light and dark variants via `@media (prefers-color-scheme: dark)`
  - [x] Add manual dark mode class support: `html.lingua-dark`
  - [x] Write visual regression test (snapshot test of theme class output)

- [x] Task 4: Wire theme system into content script (0e87cb1)
  <!-- files: content/translationDisplay.ts, entrypoints/content.ts, content/__tests__/translationDisplay.test.ts -->
  <!-- depends: task2, task3 -->
  - [x] Update `content/translationDisplay.ts` to read theme from storage and set `data-lingua-theme` on `<html>`
  - [x] Add `storage.onChanged` listener in `entrypoints/content.ts` to update theme dynamically
  - [x] Support `TranslationPosition` (below/above/side) in `applyTranslation()`
  - [x] Write unit tests for theme application and position variants

## Phase 2: Provider Validation & System Prompt
<!-- execution: parallel -->
<!-- depends: -->

- [x] Task 1: Implement provider connection tester (0e87cb1)
  <!-- files: services/providerTester.ts, services/__tests__/providerTester.test.ts -->
  - [x] Create `services/providerTester.ts` with `testConnection()` function
  - [x] Step 1: Simple ping — send minimal request, check 200
  - [x] Step 2: Model listing — `GET /v1/models`, return model array
  - [x] Step 3: Translation test — translate sample sentence, return result + latency
  - [x] Return structured `ConnectionTestResult` (steps, latency, models, error)
  - [x] Write unit tests with mocked fetch responses

- [x] Task 2: Implement template-based system prompt (0e87cb1)
  <!-- files: services/base.ts, lib/glossary.ts, services/__tests__/base.test.ts, lib/__tests__/glossary.test.ts -->
  - [x] Update `services/base.ts` → `buildSystemPrompt()` to accept optional custom template
  - [x] Implement `{{targetLanguage}}` and `{{glossary}}` variable injection
  - [x] Add `DEFAULT_SYSTEM_PROMPT_TEMPLATE` constant
  - [x] Add `validatePromptTemplate()` — check for critical rules (JSON format)
  - [x] Create `lib/glossary.ts` — format glossary entries for prompt injection
  - [x] Write unit tests for variable injection, defaults, and validation

## Phase 3: Options Page UI
<!-- execution: sequential -->
<!-- depends: phase1, phase2 -->

- [ ] Task 1: Create WXT options page entrypoint
  <!-- files: entrypoints/options/index.html, entrypoints/options/main.tsx, entrypoints/options/App.tsx, entrypoints/options/style.css -->
  - [ ] Create `entrypoints/options/index.html`, `main.tsx`, `App.tsx`, `style.css`
  - [ ] Register options page in `wxt.config.ts`
  - [ ] Implement vertical tabbed layout shell (sidebar + content area)
  - [ ] Create `TabNav` component with 8 section tabs
  - [ ] Style with Tailwind CSS (extension-owned UI)
  - [ ] Write component tests for tab navigation

- [ ] Task 2: General settings section
  <!-- files: entrypoints/options/sections/GeneralSection.tsx -->
  <!-- depends: task1 -->
  - [ ] Target language selector (dropdown with 35+ languages)
  - [ ] Display mode toggle (bilingual / translation-only)
  - [ ] Theme selector dropdown with visual indicator
  - [ ] Translation position radio (below / above / side)
  - [ ] Dark mode toggle (auto / light / dark)
  - [ ] All fields wired to Zustand settings store
  - [ ] Write component tests

- [ ] Task 3: Provider settings section
  <!-- files: entrypoints/options/sections/ProviderSection.tsx -->
  <!-- depends: task1 -->
  - [ ] Provider preset dropdown (8 presets + Custom)
  - [ ] Base URL input (auto-filled from preset)
  - [ ] API key input with masking (`sk-...xxxx` display)
  - [ ] Model selector (populated from `/v1/models` or manual input)
  - [ ] Temperature and max tokens sliders
  - [ ] "Test Connection" button with step-by-step progress UI
  - [ ] Custom system prompt template textarea with variable highlighting
  - [ ] "Reset to Default" prompt button
  - [ ] Write component tests

- [ ] Task 4: Display Themes section
  <!-- files: entrypoints/options/sections/ThemesSection.tsx -->
  <!-- depends: task1 -->
  - [ ] Gallery grid of all 15+ themes
  - [ ] Each card shows a mini-preview of bilingual display in that theme
  - [ ] Click to select, active theme highlighted
  - [ ] Light/dark mode preview toggle
  - [ ] Write component tests

- [ ] Task 5: Site Rules, Dictionary, Subtitles, Shortcuts, Advanced sections
  <!-- files: entrypoints/options/sections/SiteRulesSection.tsx, entrypoints/options/sections/DictionarySection.tsx, entrypoints/options/sections/SubtitlesSection.tsx, entrypoints/options/sections/ShortcutsSection.tsx, entrypoints/options/sections/AdvancedSection.tsx -->
  <!-- depends: task1 -->
  - [ ] **Site Rules**: List view with add/edit/delete, hostname filter, built-in rules read-only
  - [ ] **Custom Dictionary**: Glossary CRUD table (source → target), import/export JSON/CSV
  - [ ] **Subtitles**: Position dropdown, font size slider, opacity slider
  - [ ] **Keyboard Shortcuts**: Display current bindings, link to `chrome://extensions/shortcuts`
  - [ ] **Advanced**: Cache stats display, clear cache button, export/import settings JSON, debug mode toggle
  - [ ] Write component tests for each section

## Phase 4: Popup Enhancement & Loading/Error States
<!-- execution: parallel -->
<!-- depends: phase1, phase3 -->

- [ ] Task 1: Enhance popup UI
  <!-- files: entrypoints/popup/App.tsx, entrypoints/popup/style.css -->
  - [ ] Add theme selector dropdown to existing popup
  - [ ] Add translation position toggle
  - [ ] Add subtitle font size control
  - [ ] Add provider quick-switch dropdown
  - [ ] Add "Open Settings" button linking to Options page
  - [ ] Wire all controls to shared Zustand settings store
  - [ ] Write component tests

- [ ] Task 2: Implement loading and error state CSS
  <!-- files: styles/inject.css, content/translationDisplay.ts, content/__tests__/translationDisplay.test.ts -->
  - [ ] Add `data-lingua-loading` attribute and CSS shimmer animation to `styles/inject.css`
  - [ ] Add `data-lingua-error` attribute and error indicator styles
  - [ ] Update `content/translationDisplay.ts` to apply loading state before translation, error state on failure
  - [ ] Add retry mechanism — click error indicator to re-translate
  - [ ] Write unit tests for loading/error state transitions

- [ ] Task 3: Integration testing & build verification
  <!-- files: none (verification only) -->
  <!-- depends: task1, task2 -->
  - [ ] Run full test suite: `pnpm test`
  - [ ] Run lint: `pnpm lint`
  - [ ] Run build: `pnpm build`
  - [ ] Verify options page loads in Chrome
  - [ ] Verify theme switching works on a test page
  - [ ] Verify provider test connection flow
  - [ ] Update track learnings
