# Implementation Plan: Cache Configuration UI

## Phase 1: UI Implementation
<!-- execution: sequential -->

- [ ] Task: Add Cache Configuration card to AdvancedSection
  - [ ] Sub-task: Add new Card component below existing Translation Cache card with title "Cache Configuration"
  - [ ] Sub-task: Import Input component from @/ui/Input
  - [ ] Sub-task: Add three Input fields for cacheTTLDays, maxCacheSizeMB, maxBatchChars
  - [ ] Sub-task: Add labels and helper text for each field explaining the setting's purpose
  - [ ] Sub-task: Set type="number" and min/max attributes on each input
  - [ ] Sub-task: Bind input values to settings from useSettingsStore

- [ ] Task: Implement validation logic
  - [ ] Sub-task: Add validation for cacheTTLDays (min 1, max 365)
  - [ ] Sub-task: Add validation for maxCacheSizeMB (min 10, max 1000)
  - [ ] Sub-task: Add validation for maxBatchChars (min 500, max 10000)
  - [ ] Sub-task: Show visual error state when validation fails

- [ ] Task: Implement auto-save behavior
  - [ ] Sub-task: Add onBlur handler to each input field
  - [ ] Sub-task: Call updateSettings with new values on valid blur
  - [ ] Sub-task: Ensure only valid values are saved (validation before save)
  - [ ] Sub-task: Test that "Auto-saved" badge appears after successful save

- [ ] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: Testing
<!-- execution: sequential -->

- [ ] Task: Write unit tests for cache configuration inputs
  - [ ] Sub-task: Create test file for AdvancedSection cache config
  - [ ] Sub-task: Test that inputs render with correct initial values
  - [ ] Sub-task: Test validation logic for min/max bounds
  - [ ] Sub-task: Test that updateSettings is called on blur with valid values
  - [ ] Sub-task: Test that updateSettings is NOT called with invalid values

- [ ] Task: Run test suite and ensure all tests pass
  - [ ] Sub-task: Run `pnpm test` to verify all tests pass
  - [ ] Sub-task: Fix any failing tests

- [ ] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Code Quality and Final Verification
<!-- execution: sequential -->

- [ ] Task: Run linting and fix any issues
  - [ ] Sub-task: Run `pnpm lint` to check for lint errors
  - [ ] Sub-task: Fix any lint errors found

- [ ] Task: Manual verification in browser
  - [ ] Sub-task: Open Options page and navigate to Advanced section
  - [ ] Sub-task: Verify Cache Configuration card appears below existing display
  - [ ] Sub-task: Test typing valid values and verify auto-save works
  - [ ] Sub-task: Test typing invalid values and verify error state
  - [ ] Sub-task: Verify values persist after page reload
  - [ ] Sub-task: Verify existing Translation Cache card remains unchanged

- [ ] Task: Update track learnings
  - [ ] Sub-task: Document any patterns discovered during implementation
  - [ ] Sub-task: Document any gotchas or edge cases encountered

- [ ] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)
