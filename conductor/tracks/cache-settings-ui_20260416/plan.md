# Implementation Plan: Cache Configuration UI

## Phase 1: UI Implementation
<!-- execution: sequential -->

- [x] Task: Add Cache Configuration card to AdvancedSection
  - [x] Sub-task: Add new Card component below existing Translation Cache card with title "Cache Configuration"
  - [x] Sub-task: Import Input component from @/ui/Input
  - [x] Sub-task: Add three Input fields for cacheTTLDays, maxCacheSizeMB, maxBatchChars
  - [x] Sub-task: Add labels and helper text for each field explaining the setting's purpose
  - [x] Sub-task: Set type="number" and min/max attributes on each input
  - [x] Sub-task: Bind input values to settings from useSettingsStore

- [x] Task: Implement validation logic
  - [x] Sub-task: Add validation for cacheTTLDays (min 1, max 365)
  - [x] Sub-task: Add validation for maxCacheSizeMB (min 10, max 1000)
  - [x] Sub-task: Add validation for maxBatchChars (min 500, max 10000)
  - [x] Sub-task: Show visual error state when validation fails

- [x] Task: Implement auto-save behavior
  - [x] Sub-task: Add onBlur handler to each input field
  - [x] Sub-task: Call updateSettings with new values on valid blur
  - [x] Sub-task: Ensure only valid values are saved (validation before save)
  - [x] Sub-task: Test that "Auto-saved" badge appears after successful save

- [x] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: Testing
<!-- execution: sequential -->

- [x] Task: Write unit tests for cache configuration inputs
  - [x] Sub-task: Create test file for AdvancedSection cache config
  - [x] Sub-task: Test that inputs render with correct initial values
  - [x] Sub-task: Test validation logic for min/max bounds
  - [x] Sub-task: Test that updateSettings is called on blur with valid values
  - [x] Sub-task: Test that updateSettings is NOT called with invalid values

- [x] Task: Run test suite and ensure all tests pass
  - [x] Sub-task: Run `pnpm test` to verify all tests pass
  - [x] Sub-task: Fix any failing tests

- [x] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Code Quality and Final Verification
<!-- execution: sequential -->

- [x] Task: Run linting and fix any issues
  - [x] Sub-task: Run `pnpm lint` to check for lint errors
  - [x] Sub-task: Fix any lint errors found

- [x] Task: Manual verification in browser
  - [x] Sub-task: Open Options page and navigate to Advanced section
  - [x] Sub-task: Verify Cache Configuration card appears below existing display
  - [x] Sub-task: Test typing valid values and verify auto-save works
  - [x] Sub-task: Test typing invalid values and verify error state
  - [x] Sub-task: Verify values persist after page reload
  - [x] Sub-task: Verify existing Translation Cache card remains unchanged

- [x] Task: Update track learnings
  - [x] Sub-task: Document any patterns discovered during implementation
  - [x] Sub-task: Document any gotchas or edge cases encountered

- [x] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)
