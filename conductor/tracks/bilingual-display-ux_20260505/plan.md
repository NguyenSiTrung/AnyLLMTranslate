# Implementation Plan: Bilingual Display UI/UX Hardening

## Phase 1: Reliability and Trust

- [x] Task 1: Add failing tests for lazy translation status/progress
  - [x] Cover visible in-flight pieces vs off-screen observed pieces.
  - [x] Cover partial completion where translated count is below total count.
  - [x] Assert popup-facing status does not report complete while pending lazy pieces remain.

- [x] Task 2: Add failing tests for stale lifecycle behavior
  - [x] Cover restore while translation requests are in-flight.
  - [x] Cover repeated `startTranslation` calls.
  - [x] Cover settings/display-mode updates during active translation.

- [x] Task 3: Implement richer status accounting
  - [x] Track translated, in-flight, observed/pending, and total pieces.
  - [x] Expose status semantics suitable for popup display.
  - [x] Preserve existing message compatibility where possible.

- [x] Task 4: Implement session guards and start cleanup
  - [x] Add translation session/version guard to ignore stale async responses.
  - [x] Disconnect existing viewport observers before starting a new translation session.
  - [x] Ensure restore clears pending state and prevents late DOM writes.

## Phase 2: Display UX Clarity

- [x] Task 1: Add failing tests for translation-only inline loading and error visibility
  - [x] Cover short inline loading placeholder visibility in translation-only mode.
  - [x] Cover inline error visibility and text without relying on hidden originals.
  - [x] Cover clone cleanup when switching back to bilingual mode.

- [x] Task 2: Implement visible translation-only inline feedback
  - [x] Render visible sibling/clone placeholders for short inline pieces while loading.
  - [x] Keep translated/error inline output visible after original containers are hidden.
  - [x] Preserve list/table valid DOM behavior.

- [x] Task 3: Normalize display labels
  - [x] Replace popup `Replace` wording with `Translation only`.
  - [x] Keep popup and options display mode labels consistent.
  - [x] Update component tests for label changes.

- [x] Task 4: Improve ThemePreview fidelity
  - [x] Reflect current display mode and translation position/layout.
  - [x] Add representative block and short inline samples.
  - [x] Add loading and error examples where useful.
  - [x] Update ThemePreview tests.

## Phase 3: Layout Robustness and Accessibility

- [x] Task 1: Add failing tests for translation metadata and keyboard access
  - [x] Cover `lang` and `dir="auto"` on block translations, including placeholder update paths.
  - [x] Cover keyboard reveal/focus behavior for mask theme.
  - [x] Cover accessible loading/error state expectations.

- [x] Task 2: Implement translation accessibility improvements
  - [x] Set `lang` and `dir` consistently for block and inline translation elements.
  - [x] Make mask/reveal translations keyboard-accessible without requiring hover.
  - [x] Add accessible status text/attributes for loading and error states where practical.

- [x] Task 3: Add failing tests for constrained side layouts
  - [x] Cover side-by-side behavior in narrow/flex/grid/table-like containers.
  - [x] Assert fallback avoids overflow-prone fixed columns where needed.

- [x] Task 4: Implement safer side-layout fallback
  - [x] Add scoped CSS/layout rules for constrained containers.
  - [x] Avoid invalid list/table DOM changes.
  - [x] Preserve current side-by-side appearance for normal article paragraphs.

## Phase 4: Automated Validation

- [x] Task 1: Run project validators
  - [x] Run `npx -y pnpm@latest exec tsc --noEmit`.
  - [x] Run `npx -y pnpm@latest exec eslint .`.
  - [x] Run `npx -y pnpm@latest exec vitest run`.
  - [x] Run `npx -y pnpm@latest exec wxt build`.

- [x] Task 2: Fix validation regressions
  - [x] Address any typecheck, lint, test, or build failures introduced by the track.
  - [x] Re-run failed validators until passing.

## Parallel Execution Analysis

Sequential execution is recommended. Most tasks touch shared runtime and style files (`entrypoints/content.ts`, `content/translationDisplay.ts`, `styles/inject.css`, popup/options tests), so parallel implementation would increase conflict and regression risk.
