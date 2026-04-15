# Implementation Plan: Subtitle Translation Flow — Wire Missing Execution Path

## Phase 1: Registry Helper + `handleIntercepted` Core Path
<!-- execution: sequential -->

- [x] Task 1.1: Write failing tests for the `handleIntercepted` translation path (commit: 9a6de2e)
- [x] Task 1.2: Add `getHandlerByPlatform()` to `inject/subtitleHandlers/registry.ts` (commit: 9a6de2e)
- [x] Task 1.3: Implement `handleIntercepted` translation path in `content/subtitleCoordinator.ts` (commit: 9a6de2e)
- [x] Task 1.4: Conductor - User Manual Verification 'Phase 1' — tests: 14/14 pass, lint-clean

## Phase 2: Overlay Fallback Translation
<!-- execution: sequential -->

- [x] Task 2.1: Write failing tests for `activateOverlayMode` translate path (commit: 9a6de2e)
- [x] Task 2.2: Update `activateOverlayMode` in `content/subtitleCoordinator.ts` (commit: 9a6de2e)
- [x] Task 2.3: Conductor - User Manual Verification 'Phase 2' — 483/483 tests pass, lint-clean

## Phase 3: Full Verification
<!-- execution: sequential -->

- [x] Task 3.1: Run full test suite and lint
  - `pnpm test` — 483/483 tests passing (14 new + zero regressions from previous 469)
  - `pnpm lint` — lint-clean (3 initial `no-non-null-assertion` issues fixed)

- [ ] Task 3.2: Manual end-to-end verification
  - YouTube: intercept fires → subtitles translated → bilingual captions visible in player
  - Udemy: intercept fires → subtitles translated → bilingual captions visible in player
  - Sprite track on Udemy: silently skipped, no console error, no background call
  - Overlay fallback (manually block XHR in dev tools): shows translated cues

- [ ] Task 3.3: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)
