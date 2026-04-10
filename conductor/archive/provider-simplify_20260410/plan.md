# Plan: Simplify Provider Support

## Phase 1: Type System Updates
- [x] Task: Update ProviderPreset type to only include 'ollama' | 'custom'
  - [x] Sub-task: Modify types/config.ts ProviderPreset type
  - [x] Sub-task: Verify TypeScript compilation passes
- [x] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: Configuration Updates
- [x] Task: Reduce PROVIDER_PRESETS array to 2 entries
  - [x] Sub-task: Remove 7 provider entries from PROVIDER_PRESETS
  - [x] Sub-task: Verify Ollama and Custom entries are correct
- [x] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Test Updates
<!-- execution: parallel -->
<!-- depends: phase1, phase2 -->

- [x] Task: Update config test for new preset count
  <!-- files: types/__tests__/config.test.ts -->
  - [x] Sub-task: Update types/__tests__/config.test.ts to expect 2 presets
  - [x] Sub-task: Run tests to verify pass
- [x] Task: Update any provider-specific test references
  <!-- files: types/__tests__/config.test.ts, stores/__tests__/settingsStore.test.ts -->
  - [x] Sub-task: Search for removed provider names in test files
  - [x] Sub-task: Update or remove tests referencing removed providers
- [x] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)

## Phase 4: UI Updates
<!-- execution: parallel -->
<!-- depends: phase1, phase2 -->

- [x] Task: Update Options page provider dropdown
  <!-- files: entrypoints/options/App.tsx -->
  - [x] Sub-task: Locate provider dropdown component in entrypoints/options/
  - [x] Sub-task: Update to render only Ollama and Custom options (auto-updated via PROVIDER_PRESETS)
- [x] Task: Verify UI changes in browser
  <!-- files: entrypoints/options/App.tsx -->
  - [x] Sub-task: Build extension
  - [x] Sub-task: Load in Chrome and verify Options page
- [x] Task: Conductor - User Manual Verification 'Phase 4' (Protocol in workflow.md)

## Phase 5: Final Verification
- [x] Task: Run full test suite
  - [x] Sub-task: Execute pnpm test
  - [x] Sub-task: Verify all tests pass (370 passed)
- [x] Task: Run lint
  - [x] Sub-task: Execute pnpm lint
  - [x] Sub-task: Fix any lint errors (pre-existing errors, not from this refactor)
- [x] Task: Conductor - User Manual Verification 'Phase 5' (Protocol in workflow.md)
