# Plan: Paragraph Translation Progress Indicators

**Track ID:** `para-progress-indicator_20260410`

---

## Phase 1: CSS Spinner Component
<!-- execution: parallel -->
<!-- depends: -->

- [ ] Task 1: Add per-paragraph spinner CSS to `styles/inject.css`
  <!-- files: styles/inject.css -->
  - Add `.lingua-lens-loading` class with pure-CSS spinning arc (border trick, no SVG)
  - Spinner uses `var(--lingua-accent)` for theme consistency
  - Add `min-height: 1.4em` so element holds space during spinner → text transition
  - Add `@media (prefers-reduced-motion: reduce)` fallback (static dot)
  - Remove/replace existing `[data-lingua-loading]` shimmer CSS (was unused)

---

## Phase 2: Loading Placeholder System in translationDisplay.ts
<!-- execution: parallel -->
<!-- depends: -->

- [ ] Task 1: Add `showLoadingPlaceholder(parentElement, pieceId)` function
  <!-- files: content/translationDisplay.ts -->
  - Insert spinner placeholder element via `parentElement.after()` — same slot as translation
  - Element gets `data-lingua-role="translation"`, `data-lingua-piece-id`, class `lingua-lens-translation lingua-lens-loading`
  - Idempotent: if element already exists for `pieceId`, do nothing

- [ ] Task 2: Update `applyTranslation()` to update placeholder in-place
  <!-- files: content/translationDisplay.ts -->
  <!-- depends: task1 -->
  - If placeholder element exists for `pieceId`: swap class (remove `lingua-lens-loading`), set `textContent`
  - Else: create translation element (existing fallback behaviour preserved)

- [ ] Task 3: Update `setErrorState()` to update placeholder in-place
  <!-- files: content/translationDisplay.ts -->
  <!-- depends: task1 -->
  - If placeholder element exists for `pieceId`: swap class (remove `lingua-lens-loading`, add error styling), set error text
  - Else: create error element (existing fallback behaviour preserved)

---

## Phase 3: Wire Loading State in content.ts
<!-- depends: phase1, phase2 -->

- [ ] Task 1: Show spinner immediately when viewport observer fires
  - In `translatePieces()`, import and call `showLoadingPlaceholder()` for each piece **before** the `await`
  - On success: `applyTranslation()` handles the in-place update (Phase 2 Task 2)
  - On failure: catch block calls `setErrorState()` which handles in-place update (Phase 2 Task 3)
  - Remove the now-unused `setLoadingState` import from `content.ts`

- [ ] Task 2: Conductor - User Manual Verification 'Wire Loading State' (Protocol in workflow.md)

---

## Phase 4: Tests & Verification
<!-- depends: phase3 -->

- [ ] Task 1: Add unit tests for `showLoadingPlaceholder()` in `content/__tests__/translationDisplay.test.ts`
  - Test: placeholder inserted after parentElement
  - Test: idempotent (second call does nothing)
  - Test: placeholder has correct classes and attributes

- [ ] Task 2: Update existing `translationDisplay` tests to cover in-place update behaviour
  - Test: `applyTranslation()` updates existing placeholder in-place (no duplicate element)
  - Test: `setErrorState()` updates existing placeholder in-place

- [ ] Task 3: Conductor - User Manual Verification 'Translation Progress Indicators' (Protocol in workflow.md)
