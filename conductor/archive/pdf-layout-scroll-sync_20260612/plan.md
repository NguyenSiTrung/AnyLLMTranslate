# Plan: PDF Layout and Scroll Synchronization

## Phase 1: PDF Translation Request Spamming Fix
<!-- execution: sequential -->

- [x] Task 1: Prevent spamming by adding dynamic `minHeight` matching page heights and the `pdf-viewer-page` class to right-pane slot wrappers in `App.tsx`.
- [x] Task 2: Verify that existing tests run successfully.

## Phase 2: Symmetrical Layout Widths & Progress Indicator Header
<!-- execution: sequential -->

- [x] Task 1: Constrain right-pane page slot widths (`width` or `maxWidth` styles) and center them to match left-pane page widths.
- [x] Task 2: Refactor `App.tsx` and `ViewerLayout.tsx` to move the translation progress indicator pill into the persistent header.

## Phase 3: 1-to-1 Scroll Synchronization & Verification
<!-- execution: sequential -->

- [x] Task 1: Simplify `useSynchronizedScroll` to scroll 1-to-1 when scroll heights are identical/aligned.
- [x] Task 2: Run verification tests (`pnpm test`), lint (`pnpm lint`), and verify that scrolling is perfectly smooth.
