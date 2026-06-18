# Spec: PDF Translation Download

## Overview

Add a "Download Translated PDF" feature to the PDF viewer that generates and downloads a fully translated PDF document. The feature works in both **Split** and **Translation-only** view modes, producing a Layout-style output where translated text is overlaid on the original page (preserving images, tables, and visual layout).

## Functional Requirements

### FR-1: Download Button
- Add a download button (with icon) to the PDF viewer header toolbar, alongside existing view mode controls
- Button is disabled/hidden when no pages have been translated yet
- Button shows a tooltip: "Download Translated PDF"

### FR-2: Translate-All-First Strategy
- When the user clicks Download, if any pages remain untranslated:
  1. Show a progress modal/overlay: "Translating remaining pages… (X/N)"
  2. Trigger translation for ALL untranslated pages (bypass viewport-lazy trigger)
  3. Update progress in real-time as each page completes
  4. Once all pages are translated, proceed to PDF generation
  5. If any page fails, show error with retry option
- If all pages are already translated, skip directly to PDF generation

### FR-3: Translated PDF Generation (Layout Mode)
- Generate a new PDF using `pdf-lib`:
  1. Copy each original page as background (preserves images, tables, layout)
  2. Draw white opaque rectangles over original text areas (same coordinates as `LayoutOverlay` masks)
  3. Draw translated text at original paragraph positions with embedded fonts
  4. Handle text wrapping when translations are longer than originals
  5. Skip math/figure paragraphs (keep original canvas content visible — do not mask or replace)
- Output file name: `{original_filename}_translated_{targetLanguage}.pdf`

### FR-4: Font Handling (On-Demand Download)
- Fetch a suitable Unicode font (Noto Sans or similar) from Google Fonts CDN on first download
- Cache the downloaded font in IndexedDB for subsequent downloads (avoid re-downloading)
- Show font download progress as part of the overall generation progress
- Handle network errors gracefully with retry option

### FR-5: Download Delivery
- Use browser download API (`URL.createObjectURL` + `<a>` click or `chrome.downloads.download`)
- Clean up blob URL after download starts
- Show success toast notification on completion

## Non-Functional Requirements

### NFR-1: Performance
- PDF generation should use Web Workers or chunked processing to avoid blocking the UI
- Progress feedback must update smoothly during generation
- Font cache should persist across sessions (IndexedDB)

### NFR-2: Bundle Size
- `pdf-lib` adds ~90KB to the extension bundle — acceptable
- Fonts are NOT bundled — fetched on-demand only when needed

### NFR-3: Compatibility
- Must work in Chrome extension context (WXT extension page, not content script)
- Must handle PDFs of any page count (use streaming/chunked generation for large documents)

## Acceptance Criteria

1. ✅ User can click "Download" button in PDF viewer header
2. ✅ All untranslated pages are translated before PDF generation begins
3. ✅ Progress is shown during translation + generation phases
4. ✅ Downloaded PDF preserves original page layout (images, tables, backgrounds)
5. ✅ Original text is covered by white masks, translated text is placed at correct positions
6. ✅ Math/figure paragraphs are preserved without masking
7. ✅ Downloaded PDF has selectable/searchable translated text
8. ✅ Font download is cached in IndexedDB for future use
9. ✅ Works in both Split and Translation-only view modes
10. ✅ Error handling with retry for translation failures and font download failures
11. ✅ Unit tests for PDF generation logic and font caching

## Out of Scope

- Text-mode output format (clean flowing text without original background)
- Bilingual PDF output (showing both original + translated text)
- Custom font selection by the user
- PDF compression/optimization
- Batch download of multiple PDFs
