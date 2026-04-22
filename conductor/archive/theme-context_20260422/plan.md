# Plan: Custom Theme Builder & Context-Aware Translation

## Phase 1: Custom Theme — Data Model & CSS Foundation
<!-- execution: sequential -->

- [ ] Task 1: Add `custom` to ThemeName and customTheme to ExtensionSettings
  <!-- files: types/config.ts, types/__tests__/config.test.ts -->
  - [ ] Add `'custom'` to `ThemeName` union type in `types/config.ts`
  - [ ] Add `CustomThemeConfig` interface to `types/config.ts`
  - [ ] Add `customTheme?: CustomThemeConfig` to `ExtensionSettings`
  - [ ] Add default `customTheme` values to `DEFAULT_SETTINGS`
  - [ ] Update config type tests to include 17th theme

- [ ] Task 2: Add custom theme CSS rules in `styles/inject.css`
  <!-- files: styles/inject.css, styles/__tests__/themes.test.ts -->
  - [ ] Add `[data-anyllm-theme="custom"]` rule block reading CSS custom properties
  - [ ] Add dark mode variant (`html.anyllm-dark` and `prefers-color-scheme: dark`)
  - [ ] Ensure border conditionally renders (none when `--anyllm-custom-border-style: none`)
  - [ ] Update themes.test.ts for the new custom theme CSS

- [ ] Task 3: Content script — apply custom CSS variables to `<html>`
  <!-- files: content/translation/display.ts, content/translation/__tests__/display.test.ts -->
  - [ ] In display.ts, when `theme === 'custom'`, set `--anyllm-custom-*` CSS properties on `document.documentElement`
  - [ ] Read `customTheme` from settings and map to CSS variables
  - [ ] Map `fontSize` setting values: `smaller` → `0.9em`, `same` → `inherit`, `larger` → `1.1em`
  - [ ] Clean up CSS variables when theme changes away from `custom`
  - [ ] Write unit tests for CSS variable application

## Phase 2: Custom Theme — Builder UI
<!-- execution: parallel -->
<!-- depends: phase1 -->

- [ ] Task 1: Add "Custom" card to ThemesSection gallery
  <!-- files: entrypoints/options/sections/ThemesSection.tsx -->
  - [ ] Add 17th entry to `THEMES` array
  - [ ] Use Palette/Paintbrush icon for Custom card preview
  - [ ] Preview area dynamically reflects current `customTheme` settings from store

- [ ] Task 2: Create `CustomThemeEditor` component
  <!-- files: entrypoints/options/CustomThemeEditor.tsx -->
  - [ ] Create `entrypoints/options/CustomThemeEditor.tsx`
  - [ ] Implement 6 controls: text color picker, bg color picker, border style select, border color picker, font style select, font size select
  - [ ] Wire controls to `updateSettings({ customTheme: {...} })` via settingsStore
  - [ ] Add "Reset to defaults" button
  - [ ] Style with existing Card component and Tailwind design system
  - [ ] Ensure accessible color picker inputs (ARIA labels)

- [ ] Task 3: Conditional rendering and ThemePreview integration
  <!-- files: entrypoints/options/sections/ThemesSection.tsx, entrypoints/options/ThemePreview.tsx -->
  <!-- depends: task1, task2 -->
  - [ ] Render `CustomThemeEditor` below the theme grid when `theme === 'custom'`
  - [ ] Add slide-in animation for editor panel appearance
  - [ ] In ThemePreview: when `theme === 'custom'`, apply `--anyllm-custom-*` CSS properties to preview container
  - [ ] Ensure preview updates reactively as settings change

- [ ] Task 4: Unit tests for Custom Theme UI
  <!-- files: entrypoints/options/__tests__/CustomThemeEditor.test.tsx, entrypoints/options/__tests__/ThemesSection.test.tsx -->
  <!-- depends: task2, task3 -->
  - [ ] Test CustomThemeEditor renders all 6 controls
  - [ ] Test color picker changes update settings store
  - [ ] Test reset button restores defaults
  - [ ] Test ThemesSection conditionally renders editor when custom is selected
  - [ ] Test ThemePreview applies custom CSS variables

- [ ] Task 5: Conductor - User Manual Verification 'Custom Theme Builder UI' (Protocol in workflow.md)

## Phase 3: Context-Aware Translation
<!-- execution: parallel -->
<!-- depends: -->

- [ ] Task 1: Create `PageContext` type and `extractPageContext` utility
  <!-- files: types/config.ts, content/utils/pageContext.ts, content/utils/__tests__/pageContext.test.ts -->
  - [ ] Define `PageContext` interface in `types/config.ts`
  - [ ] Create `content/utils/pageContext.ts` with `extractPageContext(doc: Document): PageContext`
  - [ ] Extract `document.title` (truncate 100 chars), `meta[name="description"]` (truncate 200 chars), `window.location.hostname`
  - [ ] Write unit tests for extractPageContext with various DOM configurations

- [ ] Task 2: Add category detection heuristic
  <!-- files: content/utils/pageContext.ts, content/utils/__tests__/pageContext.test.ts -->
  <!-- depends: task1 -->
  - [ ] Create domain-to-category map (top 20-30 domains) in `content/utils/pageContext.ts`
  - [ ] Add `<meta keywords>` fallback detection
  - [ ] Add `<h1>` text analysis fallback
  - [ ] Only run when `enablePageCategoryDetection === true` (passed as parameter)
  - [ ] Write unit tests for category detection across known and unknown domains

- [ ] Task 3: Extend `buildSystemPrompt` with page context
  <!-- files: services/base.ts, services/__tests__/base.test.ts -->
  - [ ] Add optional `pageContext?: PageContext` parameter to `buildSystemPrompt()` in `services/base.ts`
  - [ ] Append formatted context block to prompt (only non-empty fields)
  - [ ] Ensure backward compatibility (existing callers without pageContext work unchanged)
  - [ ] Update existing `buildSystemPrompt` tests
  - [ ] Write new tests for context injection with various PageContext configurations

- [ ] Task 4: Update TRANSLATE message protocol and wiring
  <!-- files: entrypoints/content.ts, entrypoints/background.ts, services/openaiCompatible.ts -->
  <!-- depends: task1, task3 -->
  - [ ] Extend `TRANSLATE` message type to include optional `pageContext` field
  - [ ] Content script calls `extractPageContext()` before sending `TRANSLATE` message
  - [ ] Background handler passes `pageContext` to `buildSystemPrompt()`
  - [ ] Verify `openaiCompatible.ts` receives enriched prompt without changes

- [ ] Task 5: Add settings toggle in Advanced section
  <!-- files: types/config.ts, entrypoints/options/sections/AdvancedSection.tsx -->
  - [ ] Add `enablePageCategoryDetection: boolean` to `ExtensionSettings` (default: `false`)
  - [ ] Add toggle in `AdvancedSection.tsx` with label "Page Category Detection" and description
  - [ ] Wire toggle to `updateSettings()`

- [ ] Task 6: Conductor - User Manual Verification 'Context-Aware Translation' (Protocol in workflow.md)
