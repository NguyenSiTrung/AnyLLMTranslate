# Plan: PDF Layout Preservation

## Phase 1: Coordinate Capture & Text Extraction
<!-- execution: sequential -->

- [x] Task 1: Update `PdfParagraph` interface and text extraction functions in [pdfTextExtraction.ts](file:///home/trung/Documents/ML/Project/AnyLLMTranslate/entrypoints/pdf-viewer/lib/pdfTextExtraction.ts) to calculate and store coordinate bounding boxes `(x, y, width, height)` for each grouped paragraph.
- [x] Task 2: Update `PageTranslations` interface in [pdfTranslation.ts](file:///home/trung/Documents/ML/Project/AnyLLMTranslate/entrypoints/pdf-viewer/lib/pdfTranslation.ts) and the `translatePage` flow in [usePdfPageTranslations.ts](file:///home/trung/Documents/ML/Project/AnyLLMTranslate/entrypoints/pdf-viewer/hooks/usePdfPageTranslations.ts) to store `originalParagraphs`.
- [x] Task 3: Add unit tests to verify paragraph coordinate calculation correctness.

## Phase 2: Toggle UI & Layout Mode Switching
<!-- execution: sequential -->

- [x] Task 1: Add the `pdfLayoutMode` state ('original' or 'text') in [App.tsx](file:///home/trung/Documents/ML/Project/AnyLLMTranslate/entrypoints/pdf-viewer/App.tsx) and implement the toggle pill in the persistent global header.
- [x] Task 2: Pass down the layout state and the page/viewport properties to `PdfTranslationPane` in [App.tsx](file:///home/trung/Documents/ML/Project/AnyLLMTranslate/entrypoints/pdf-viewer/App.tsx).

## Phase 3: Canvas Overlay Rendering
<!-- execution: sequential -->

- [x] Task 1: Render the identical page background canvas in [PdfTranslationPane.tsx](file:///home/trung/Documents/ML/Project/AnyLLMTranslate/entrypoints/pdf-viewer/components/PdfTranslationPane.tsx) when `layoutMode === 'original'`.
- [x] Task 2: Build the absolute coordinate overlay layer to map paragraph positions from PDF space to viewport CSS space, complete with masking (white background, dark text) and font-size auto-scaling heuristics.
- [x] Task 3: Add status overlays (loading skeleton, error state, idle state) that overlay nicely on top of the rendered canvas when the translation is not yet ready.

## Phase 4: Quality Checks & Verification
<!-- execution: sequential -->

- [x] Task 1: Run project tests (`pnpm test`) to ensure there are no regressions.
- [x] Task 2: Run linter and typecheck (`pnpm lint` and `npx tsc --noEmit`) to verify quality and code consistency.
