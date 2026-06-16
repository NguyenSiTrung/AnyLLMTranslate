# Plan: PDF Elastic Overlay Layout Mode

## Phase 1: Analysis & Baseline Tests

<!-- execution: sequential -->

- [x] Task 1: Audit current `Layout` mode code paths in `PdfTranslationPane.tsx`, `style.css`, `useSynchronizedScroll.ts`, and `App.tsx`.
- [x] Task 2: Add or update tests that assert the current Layout clipping behavior so the refactor has a measurable baseline.
- [x] Task 3: Verify `Text` mode is the default and remains unaffected by upcoming changes.

## Phase 2: Remove Rigid Clipping Behaviors

<!-- execution: sequential -->

- [x] Task 1: Remove `isLikelyClipped`, clipped badge, full-text popover, hover scale, and micro-font scaling from `PdfTranslationPane.tsx`.
- [x] Task 2: Remove `whiteSpace: nowrap` forcing for single-line source paragraphs.
- [x] Task 3: Establish a readable minimum font size and clean overlay CSS in `style.css`.
- [x] Task 4: Update or delete existing tests that relied on clipping/popover behavior.

## Phase 3: Build Elastic Overlay Renderer

<!-- execution: sequential -->

- [x] Task 1: Add a new elastic layout rendering path in `PdfTranslationPane.tsx` (keep original canvas background; render paragraphs as reflowable boxes).
- [x] Task 2: Use paragraph reading order and scaled horizontal position for placement; set height to `auto`.
- [x] Task 3: Update right pane page slots in `App.tsx` to use `height: auto` when `layoutMode === 'original'`.
- [x] Task 4: Preserve loading, error, and empty overlays for non-translated states.
- [x] Task 5: Add component tests for elastic layout rendering and natural height.

## Phase 4: Page-Based Scroll Synchronization

<!-- execution: sequential -->

- [x] Task 1: Replace ratio-based `mirrorScrollTop` with a page-block interpolation algorithm in `useSynchronizedScroll.ts`.
- [x] Task 2: Expose page boundary information from the right pane slots to the scroll hook.
- [x] Task 3: Add unit tests for page-based scroll sync with mismatched left/right heights.
- [x] Task 4: Manually verify scroll alignment across short and long translated pages.

## Phase 5: Mode UX Polish & Labels

<!-- execution: sequential -->

- [x] Task 1: Update `Layout | Text` toggle labels and tooltips in `App.tsx`.
- [x] Task 2: Add concise helper text or accessible labels explaining the two modes.
- [x] Task 3: Update tests for default mode and toggle behavior.

## Phase 6: Quality Checks & Verification

<!-- execution: sequential -->

- [x] Task 1: Run targeted PDF viewer tests during iteration.
- [x] Task 2: Run full project tests (`pnpm test`).
- [x] Task 3: Run lint (`pnpm lint`) and typecheck (`npx tsc --noEmit`).
- [x] Task 4: Run production build (`pnpm build`).
- [x] Task 5: Capture implementation learnings in `learnings.md`.
