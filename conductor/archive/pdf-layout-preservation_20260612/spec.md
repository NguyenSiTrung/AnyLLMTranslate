# Spec: PDF Layout Preservation

## Overview
This track implements the ability to render translated PDF text within its original page layout in the right-hand translation pane. It preserves all original graphics, tables, background templates, and images by rendering the PDF page to a canvas and overlaying absolutely-positioned translation text boxes.

## Recommended Choices & Rationales

1. **Toggle UI**: We will introduce a high-end segmented control pill `[ Layout | Text ]` in the persistent PDF viewer header on the right-hand side. This allows the user to dynamically toggle between the original page layout view and the simplified text-only flow view.
2. **Text Masking Color**: We will use a solid white (`#ffffff`) background for the absolute translation overlays by default. This masks the underlying original text on the canvas. The text color will be dark (`#1a1a1a`) to ensure proper readability and contrast.
3. **Reflow & Auto-scaling Heuristic**: We will dynamically scale the font size down based on the character count ratio of the original text vs the translated text.
   scaleFactor = Math.max(0.4, Math.min(1.0, originalLength / translatedLength))
   computedFontSize = originalFontSize * scaleFactor
   This ensures that longer translations (e.g. Vietnamese/German) shrink to fit their bounding boxes rather than overflowing and overlapping other elements.
4. **Overlay Style**: The right-pane layout overlay will display *only* the translated text, masking the original text. Since the left pane displays the original text, this side-by-side design provides a perfect bilingual reading experience.

## Functional Requirements

1. **Coordinate Capture in Extraction**:
   - Update [pdfTextExtraction.ts](file:///home/trung/Documents/ML/Project/AnyLLMTranslate/entrypoints/pdf-viewer/lib/pdfTextExtraction.ts) to calculate and store coordinate bounding boxes `(x, y, width, height)` for each extracted paragraph in PDF design units.
   - Retain the paragraph's average font size and heading status.
2. **State Enhancement**:
   - Update `PageTranslations` in [pdfTranslation.ts](file:///home/trung/Documents/ML/Project/AnyLLMTranslate/entrypoints/pdf-viewer/lib/pdfTranslation.ts) to store `originalParagraphs` alongside the translated paragraph maps.
3. **Toggle UI Integration**:
   - Add a `pdfLayoutMode` state (`'original' | 'text'`) to [App.tsx](file:///home/trung/Documents/ML/Project/AnyLLMTranslate/entrypoints/pdf-viewer/App.tsx) and default to `'original'`.
   - Render a layout toggle pill in the global header using `headerExtra`.
4. **Overlay Rendering on Canvas**:
   - In [PdfTranslationPane.tsx](file:///home/trung/Documents/ML/Project/AnyLLMTranslate/entrypoints/pdf-viewer/components/PdfTranslationPane.tsx), if `layoutMode === 'original'`:
     - Render [PdfCanvasRenderer](file:///home/trung/Documents/ML/Project/AnyLLMTranslate/entrypoints/pdf-viewer/components/PdfCanvasRenderer.tsx) to draw the identical background page.
     - On top of the canvas, render an absolute overlay wrapper container.
     - Within this container, render absolute `<div>` nodes for each paragraph positioned using viewport-scaled coordinates (`left`, `top`, `width`, `height` computed from the PDF `viewport`).
     - Render the translated text with dynamic font-size scaling.
     - For states other than `'translated'` (e.g., `'translating'`, `'error'`), render a floating overlay pill or card on top of the canvas to display the status and action buttons (e.g., retry).

## Acceptance Criteria
- [x] Users can toggle layout mode between `Layout` and `Text` via a toggle pill in the header.
- [x] In `Layout` mode, the right pane renders the canvas background showing all original images/tables.
- [x] Original text is successfully hidden/masked under the white absolute translation boxes.
- [x] Translated text displays at the correct positions with appropriate font-size scaling.
- [x] All 900+ tests pass, including new tests for text extraction coordinates.
