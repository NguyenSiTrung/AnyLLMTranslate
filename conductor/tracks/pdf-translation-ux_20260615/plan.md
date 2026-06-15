# Plan: PDF Translation UX Improvements

## Phase 1: Baseline Tests and Default Reading Mode

<!-- execution: sequential -->

- [ ] Task 1: Add or update tests for the PDF viewer default layout state in `entrypoints/pdf-viewer/App.tsx`.
- [ ] Task 2: Change the PDF viewer default translation pane mode from `Layout` to `Text`.
- [ ] Task 3: Verify the existing `Layout | Text` toggle still switches both modes correctly.

## Phase 2: Layout Mode Full-Text Interaction

<!-- execution: sequential -->

- [ ] Task 1: Add tests for keyboard and click access to full translated text in `PdfTranslationPane`.
- [ ] Task 2: Add focusable layout translation blocks when full text is available.
- [ ] Task 3: Implement a persistent full-translation popover/card for layout blocks.
- [ ] Task 4: Add `Escape` dismissal and single-open-popover behavior.

## Phase 3: Clipping Affordance and Copy Polish

<!-- execution: sequential -->

- [ ] Task 1: Add a clipping or likely-clipping detection heuristic for layout translation blocks.
- [ ] Task 2: Render a small full-text affordance only for clipped or likely clipped blocks.
- [ ] Task 3: Add concise helper copy or accessible labels explaining `Text` versus `Layout` mode.
- [ ] Task 4: Ensure styling remains scoped to `entrypoints/pdf-viewer/style.css`.

## Phase 4: Quality Checks and Verification

<!-- execution: sequential -->

- [ ] Task 1: Run targeted PDF viewer tests during iteration.
- [ ] Task 2: Run full project tests.
- [ ] Task 3: Run lint and typecheck.
- [ ] Task 4: Capture implementation learnings in `learnings.md`.
