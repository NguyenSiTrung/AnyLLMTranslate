# Plan: Settings UI/UX Enhancement & Subtitle Configuration

## Phase 1: Subtitle Settings Expansion (Types & Store)

- [x] Task 1: Extend `SubtitleSettings` type with `fontFamily`, `displayMode`, `translationTimeout` fields + update `DEFAULT_SUBTITLE_SETTINGS` and `DEFAULT_SETTINGS`
  <!-- files: types/config.ts -->
- [x] Task 2: Wire new fields through `settingsStore` — ensure deep merge handles new `subtitleSettings` fields, verify chrome.storage sync
  <!-- files: stores/settingsStore.ts -->
- [x] Task 3: Write unit tests for new settings fields (defaults, persistence, deep merge)
  <!-- files: stores/__tests__/settingsStore.test.ts -->

## Phase 2: Subtitle Settings UI
<!-- depends: phase1 -->

- [x] Task 1: Add font family SegmentedControl (System / Serif / Mono), display mode SegmentedControl (Bilingual / Translation Only), and timeout Slider (10s–120s) to SubtitlesSection
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->
- [x] Task 2: Enhance subtitle preview — mini video player aesthetic with dark gradient, decorative play icon, animated cue, reactive to all subtitle settings (font family, size, position, opacity, display mode)
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->
- [x] Task 3: Write component tests for SubtitlesSection new controls and preview
  <!-- files: entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx -->

## Phase 3: Wire Settings to Runtime
<!-- depends: phase1 -->

- [x] Task 1: Apply `fontFamily` to subtitle overlay — add CSS custom property `--anyllm-subtitle-font-family`, read from settings in `subtitleOverlay.ts`
  <!-- files: styles/subtitle.css, content/subtitleOverlay.ts -->
- [x] Task 2: Apply `displayMode` to overlay renderer — show/hide `.anyllm-translate-subtitle-original` based on setting, update coordinator to pass display mode to overlay
  <!-- files: content/subtitleOverlay.ts, content/subtitleCoordinator.ts -->
- [x] Task 3: Apply `translationTimeout` to coordinator — read from settings, replace hardcoded `30000`
  <!-- files: content/subtitleCoordinator.ts -->
- [x] Task 4: Write/update tests for runtime wiring (font family application, display mode toggle, timeout configuration)
  <!-- files: content/__tests__/subtitleOverlay.test.ts, content/__tests__/subtitleCoordinator.test.ts -->

## Phase 4: Settings UI Visual Polish
<!-- depends: -->
<!-- execution: parallel -->

- [x] Task 1: Card consistency audit — ensure all 8 sections use title+icon pattern on all Cards, fix any missing icons or inconsistent card variants
  <!-- files: entrypoints/options/sections/GeneralSection.tsx, entrypoints/options/sections/ShortcutsSection.tsx, entrypoints/options/sections/ProviderSection.tsx, entrypoints/options/sections/DictionarySection.tsx, entrypoints/options/sections/SiteRulesSection.tsx, entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/sections/SubtitlesSection.tsx -->
- [x] Task 2: Improve hover/focus states — add subtle scale/border transitions on theme cards, provider preset cards, dictionary table rows, site rule rows
  <!-- files: entrypoints/options/sections/ThemesSection.tsx, entrypoints/options/sections/ProviderSection.tsx, entrypoints/options/sections/DictionarySection.tsx, entrypoints/options/sections/SiteRulesSection.tsx -->
- [x] Task 3: Tighten spacing — refine section header margins, card gaps, FieldGroup vertical rhythm for visual consistency across all sections
  <!-- files: entrypoints/options/style.css, entrypoints/options/sections/GeneralSection.tsx, entrypoints/options/sections/SubtitlesSection.tsx, entrypoints/options/sections/ShortcutsSection.tsx -->

## Phase 5: Verification & Cleanup
<!-- depends: phase2, phase3, phase4 -->

- [ ] Task 1: Run full test suite (`pnpm test`), fix any failures
- [ ] Task 2: Run lint (`pnpm lint`), fix any issues
- [ ] Task 3: Build verification (`wxt build`)
- [ ] Task 4: Capture track learnings
