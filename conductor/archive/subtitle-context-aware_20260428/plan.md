# Implementation Plan: subtitle-context-aware_20260428

## Phase 1: Type & Interface Foundation
<!-- execution: sequential -->

- [ ] Task 1: Extend `TranslateSubtitleMessage` with `pageContext?: PageContext`
  <!-- files: types/messages.ts -->

- [ ] Task 2: Verify `SubtitleTranslationRequest` type compatibility with `pageContext`
  <!-- files: types/translation.ts -->

- [ ] Task: Conductor - User Manual Verification 'Phase 1: Type & Interface Foundation' (Protocol in workflow.md)

## Phase 2: Implementation
<!-- execution: parallel -->

- [ ] Task 1: Extract page context in `subtitleCoordinator.ts`
  <!-- files: content/subtitleCoordinator.ts -->
  - Import `extractPageContext` and `resolveCategory` from `content/utils/pageContext.ts`
  - Read settings to check `enableContextAwareTranslation`
  - Read `categoryOverride` from `services/categoryStore.ts` (via sendMessage or direct import if available in content script)
  - Resolve category: `tabOverride ?? siteRuleCategory ?? autoDetected`
  - Include `pageContext` in `translateSubtitle` messages (both `handleIntercepted` and `activateOverlayMode` paths)
  - Handle edge case: `enableContextAwareTranslation` is false -> send `pageContext: undefined`

- [ ] Task 2: Forward `pageContext` in `handleTranslateSubtitle()`
  <!-- files: services/background.ts -->
  - Extract `pageContext` from `TranslateSubtitleMessage` in `handleTranslateSubtitle()`
  - Pass to `service.translate({ ..., pageContext })`
  - No changes needed in `buildSystemPrompt()` or `openaiCompatible.ts` — already supported

- [ ] Task: Conductor - User Manual Verification 'Phase 2: Implementation' (Protocol in workflow.md)

## Phase 3: Testing
<!-- execution: sequential -->
<!-- depends: phase2 -->

- [ ] Task 1: Unit tests for coordinator context extraction
  <!-- files: content/__tests__/subtitleCoordinator.test.ts (or new file) -->
  - Test: sends `pageContext` when `enableContextAwareTranslation` is true
  - Test: omits `pageContext` when feature is disabled
  - Test: category override resolution (tab -> site rule -> auto-detected)
  - Test: `resolveCategory` integration with mocked categoryStore

- [ ] Task 2: Unit tests for background handler forwarding
  <!-- files: services/__tests__/background.test.ts -->
  - Test: `handleTranslateSubtitle()` passes `pageContext` through to `service.translate()`
  - Test: works correctly when `pageContext` is undefined (backward compat)

- [ ] Task 3: Integration test for prompt injection
  <!-- files: services/__tests__/base.test.ts -->
  - Test: `buildSystemPrompt()` includes page metadata when `pageContext` is provided for subtitle-like request

- [ ] Task 4: Regression tests
  <!-- files: existing subtitle test files -->
  - Ensure all existing subtitle tests pass without modification
  - Ensure no `pageContext`-related type errors

- [ ] Task: Conductor - User Manual Verification 'Phase 3: Testing' (Protocol in workflow.md)

## Phase 4: Verification & Polish
<!-- execution: sequential -->
<!-- depends: phase3 -->

- [ ] Task 1: Run full test suite: `pnpm test`
- [ ] Task 2: Run lint: `pnpm lint`
- [ ] Task 3: Manual browser verification (optional): load extension, enable context-aware, translate YouTube subtitles, verify prompt includes page context in LLM request
- [ ] Task 4: Update track learnings in `learnings.md`
- [ ] Task 5: Commit with conventional commit: `feat(subtitles): wire context-aware and category override to subtitle translation`

- [ ] Task: Conductor - User Manual Verification 'Phase 4: Verification & Polish' (Protocol in workflow.md)
