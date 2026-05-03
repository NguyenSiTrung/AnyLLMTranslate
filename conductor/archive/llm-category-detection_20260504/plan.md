# Implementation Plan: LLM-based Page Category Detection

## Phase 1: Settings & UI Configuration
- [x] Task 1: Update ExtensionSettings in types/config.ts with `enableLLMPageCategoryDetection` and `llmCategoryDetectionMode`.
- [x] Task 2: Implement UI in AdvancedSection.tsx (Toggle + Select dropdown).

## Phase 2: LLM Category Pipeline
- [x] Task 1: Create `detectCategoryWithLLM` utility to interface with the active Provider.
- [x] Task 2: Implement Background handler for `DETECT_PAGE_CATEGORY_LLM` message.

## Phase 3: Content Script Integration
- [x] Task 1: Modify `resolveCategory` / translation init flow to check `llmCategoryDetectionMode`.
- [x] Task 2: Handle `async` mode (dispatch non-blocking message, use heuristic first).
- [x] Task 3: Handle `blocking` mode (await background response before proceeding).

## Phase 4: Final Testing & Verification
- [x] Task 1: Verify Async mode resolves category gracefully without blocking translation.
- [x] Task 2: Verify Blocking mode awaits category before translation starts.
- [x] Task 3: Ensure robust error handling (fallback to `Other` or `heuristic`).md)
