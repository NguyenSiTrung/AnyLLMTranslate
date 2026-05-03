# Implementation Plan: LLM-based Page Category Detection

## Phase 1: Settings & UI Configuration
- [ ] Task 1: Update ExtensionSettings in types/config.ts with `enableLLMPageCategoryDetection` and `llmCategoryDetectionMode`.
- [ ] Task 2: Implement UI in AdvancedSection.tsx (Toggle + Select dropdown).

## Phase 2: LLM Category Pipeline
- [ ] Task 1: Create `detectCategoryWithLLM` utility to interface with the active Provider.
- [ ] Task 2: Implement Background handler for `DETECT_PAGE_CATEGORY_LLM` message.

## Phase 3: Content Script Integration
- [ ] Task 1: Modify `resolveCategory` / translation init flow to check `llmCategoryDetectionMode`.
- [ ] Task 2: Handle `async` mode (dispatch non-blocking message, use heuristic first).
- [ ] Task 3: Handle `blocking` mode (await background response before proceeding).

## Phase 4: Verification
- [ ] Task: Conductor - User Manual Verification 'Phase Verification' (Protocol in workflow.md)
