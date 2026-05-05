# Implementation Plan: Bilingual Display UI/UX Hardening

## Phase 1: Reliability and Trust

- [ ] Task 1: Add failing tests for lazy translation status/progress
  - [ ] Cover visible in-flight pieces vs off-screen observed pieces.
  - [ ] Cover partial completion where translated count is below total count.
  - [ ] Assert popup-facing status does not report complete while pending lazy pieces remain.

- [ ] Task 2: Add failing tests for stale lifecycle behavior
  - [ ] Cover restore while translation requests are in-flight.
  - [ ] Cover repeated `startTranslation` calls.
  - [ ] Cover settings/display-mode updates during active translation.

- [ ] Task 3: Implement richer status accounting
  - [ ] Track translated, in-flight, observed/pending, and total pieces.
  - [ ] Expose status semantics suitable for popup display.
  - [ ] Preserve existing message compatibility where possible.

- [ ] Task 4: Implement session guards and start cleanup
  - [ ] Add translation session/version guard to ignore stale async responses.
  - [ ] Disconnect existing viewport observers before starting a new translation session.
  - [ ] Ensure restore clears pending state and prevents late DOM writes.

## Phase 2: Display UX Clarity

- [ ] Task 1: Add failing tests for translation-only inline loading and error visibility
  - [ ] Cover short inline loading placeholder visibility in translation-only mode.
  - [ ] Cover inline error visibility and text without relying on hidden originals.
  - [ ] Cover clone cleanup when switching back to bilingual mode.

- [ ] Task 2: Implement visible translation-only inline feedback
  - [ ] Render visible sibling/clone placeholders for short inline pieces while loading.
  - [ ] Keep translated/error inline output visible after original containers are hidden.
  - [ ] Preserve list/table valid DOM behavior.

- [ ] Task 3: Normalize display labels
  - [ ] Replace popup `Replace` wording with `Translation only`.
  - [ ] Keep popup and options display mode labels consistent.
  - [ ] Update component tests for label changes.

- [ ] Task 4: Improve ThemePreview fidelity
  - [ ] Reflect current display mode and translation position/layout.
  - [ ] Add representative block and short inline samples.
  - [ ] Add loading and error examples where useful.
  - [ ] Update ThemePreview tests.

## Phase 3: Layout Robustness and Accessibility

- [ ] Task 1: Add failing tests for translation metadata and keyboard access
  - [ ] Cover `lang` and `dir="auto"` on block translations, including placeholder update paths.
  - [ ] Cover keyboard reveal/focus behavior for mask theme.
  - [ ] Cover accessible loading/error state expectations.

- [ ] Task 2: Implement translation accessibility improvements
  - [ ] Set `lang` and `dir` consistently for block and inline translation elements.
  - [ ] Make mask/reveal translations keyboard-accessible without requiring hover.
  - [ ] Add accessible status text/attributes for loading and error states where practical.

- [ ] Task 3: Add failing tests for constrained side layouts
  - [ ] Cover side-by-side behavior in narrow/flex/grid/table-like containers.
  - [ ] Assert fallback avoids overflow-prone fixed columns where needed.

- [ ] Task 4: Implement safer side-layout fallback
  - [ ] Add scoped CSS/layout rules for constrained containers.
  - [ ] Avoid invalid list/table DOM changes.
  - [ ] Preserve current side-by-side appearance for normal article paragraphs.

## Phase 4: Automated Validation

- [ ] Task 1: Run project validators
  - [ ] Run `npx -y pnpm@latest exec tsc --noEmit`.
  - [ ] Run `npx -y pnpm@latest exec eslint .`.
  - [ ] Run `npx -y pnpm@latest exec vitest run`.
  - [ ] Run `npx -y pnpm@latest exec wxt build`.

- [ ] Task 2: Fix validation regressions
  - [ ] Address any typecheck, lint, test, or build failures introduced by the track.
  - [ ] Re-run failed validators until passing.

## Parallel Execution Analysis

Sequential execution is recommended. Most tasks touch shared runtime and style files (`entrypoints/content.ts`, `content/translationDisplay.ts`, `styles/inject.css`, popup/options tests), so parallel implementation would increase conflict and regression risk.
