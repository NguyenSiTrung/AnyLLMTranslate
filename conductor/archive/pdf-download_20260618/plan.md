# Plan: PDF Translation Download

## Phase 1: PDF Generation Engine
<!-- execution: parallel -->

Core pdf-lib based generator that takes original PDF bytes + translation data and produces a new translated PDF.

- [ ] Task 1: Install pdf-lib and create TranslatedPdfGenerator module
  <!-- files: package.json, entrypoints/pdf-viewer/lib/translatedPdfGenerator.ts -->
  - [ ] Install `pdf-lib` as a dependency
  - [ ] Create `entrypoints/pdf-viewer/lib/translatedPdfGenerator.ts`
  - [ ] Implement `generateTranslatedPdf(originalPdfBytes, allPageTranslations, fontBytes)` → `Promise<Uint8Array>`
  - [ ] For each page: copy original page as background via `pdfDoc.embedPage()`
  - [ ] Draw white opaque rectangles at original paragraph positions (mask original text)
  - [ ] Skip mask + text for math/figure paragraphs (check `paragraphKinds` map — `kind !== 'prose'`)
  - [ ] Draw translated text at original coordinates with embedded custom font
  - [ ] Implement manual text wrapping logic for translated text that exceeds original paragraph width
  - [ ] Clamp font size using same logic as LayoutOverlay: `min(max(fontSize * scale, 12), 32)`
  - [ ] Handle headings: use full available width for heading paragraphs

- [ ] Task 2: Write unit tests for TranslatedPdfGenerator
  <!-- files: entrypoints/pdf-viewer/lib/__tests__/translatedPdfGenerator.test.ts -->
  - [ ] Test: generates valid PDF bytes (non-empty Uint8Array)
  - [ ] Test: correct number of pages in output
  - [ ] Test: math/figure paragraphs are not masked (kind-based skip logic)
  - [ ] Test: text wrapping produces multiple lines for long translations
  - [ ] Test: empty translations map produces PDF with only original pages
  - [ ] Test: handles pages with zero paragraphs gracefully

## Phase 2: Font Management
<!-- execution: parallel -->
<!-- depends: -->

On-demand font download from Google Fonts CDN with IndexedDB caching.

- [ ] Task 1: Create font fetcher and cache service
  <!-- files: entrypoints/pdf-viewer/lib/pdfFontManager.ts -->
  - [ ] Create `entrypoints/pdf-viewer/lib/pdfFontManager.ts`
  - [ ] Implement `getFont(): Promise<Uint8Array>` — checks IndexedDB cache first, falls back to CDN fetch
  - [ ] Use Google Fonts API to fetch Noto Sans (regular weight, full Unicode subset)
  - [ ] Store downloaded font bytes in IndexedDB via `idb-keyval` (already in project deps)
  - [ ] Implement cache key strategy: `pdf-font:{fontName}:{version}`
  - [ ] Add `clearFontCache()` for debugging/testing
  - [ ] Handle fetch errors with descriptive messages
  - [ ] Expose `onProgress` callback for download progress reporting

- [ ] Task 2: Write unit tests for font manager
  <!-- files: entrypoints/pdf-viewer/lib/__tests__/pdfFontManager.test.ts -->
  - [ ] Test: returns cached font when available in IndexedDB (no fetch call)
  - [ ] Test: fetches from CDN on cache miss and stores in IndexedDB
  - [ ] Test: fetch error throws descriptive error message
  - [ ] Test: `clearFontCache()` removes cached font from IndexedDB
  - [ ] Test: progress callback is invoked during fetch

## Phase 3: Translate-All Pipeline
<!-- execution: parallel -->
<!-- depends: -->

Force-translate all remaining pages before PDF generation, with progress tracking.

- [ ] Task 1: Create `translateAllPages` utility function
  <!-- files: entrypoints/pdf-viewer/lib/translateAllPages.ts -->
  - [ ] Create `entrypoints/pdf-viewer/lib/translateAllPages.ts`
  - [ ] Implement `translateAllPages(pages, pdfUrl, existingTranslations, onProgress)` → `Promise<Map<number, PageTranslations>>`
  - [ ] Identify pages not yet in `translated` state from existing translations map
  - [ ] Reuse existing `translatePage` logic (extract text → `translateParagraphs`)
  - [ ] Process pages sequentially (respect semaphore concurrency — max 2 for PDF)
  - [ ] Call `onProgress(completedCount, totalCount)` after each page completes
  - [ ] Merge newly translated pages with existing translations
  - [ ] Support cancellation via `AbortSignal`
  - [ ] On page failure: continue with remaining pages, collect errors, report at end

- [ ] Task 2: Write unit tests for translateAllPages
  <!-- files: entrypoints/pdf-viewer/lib/__tests__/translateAllPages.test.ts -->
  - [ ] Test: skips pages already in `translated` state
  - [ ] Test: translates only `idle`/`error` pages
  - [ ] Test: progress callback reports correct counts
  - [ ] Test: cancellation via AbortSignal stops processing
  - [ ] Test: page failure continues with remaining pages
  - [ ] Test: merges existing + new translations correctly

## Phase 4: UI Integration & Download Flow
<!-- execution: sequential -->
<!-- depends: phase1, phase2, phase3 -->

Wire everything together: download button, progress modal, and end-to-end download flow.

- [ ] Task 1: Create DownloadProgressModal component
  <!-- files: entrypoints/pdf-viewer/components/DownloadProgressModal.tsx -->
  - [ ] Create `entrypoints/pdf-viewer/components/DownloadProgressModal.tsx`
  - [ ] Multi-stage progress display:
    - Stage 1: "Translating remaining pages… (X/N)"
    - Stage 2: "Downloading font…" (only on first download)
    - Stage 3: "Generating PDF… (X/N pages)"
  - [ ] Progress bar with percentage
  - [ ] Cancel button to abort the process
  - [ ] Error state with retry button
  - [ ] Success state with auto-close

- [ ] Task 2: Create `usePdfDownload` hook (orchestration)
  <!-- files: entrypoints/pdf-viewer/hooks/usePdfDownload.ts -->
  - [ ] Create `entrypoints/pdf-viewer/hooks/usePdfDownload.ts`
  - [ ] Implement `usePdfDownload(pdfUrl, pages, translations)` returning `{ startDownload, cancel, stage, progress, error, isDownloading }`
  - [ ] Orchestrate the 3-stage pipeline:
    1. Call `translateAllPages` for untranslated pages
    2. Call `getFont()` to obtain font bytes
    3. Fetch original PDF bytes and call `generateTranslatedPdf`
  - [ ] Trigger browser download via `URL.createObjectURL` + `<a>` click
  - [ ] Generate filename: `{original_name}_translated_{targetLanguage}.pdf`
  - [ ] Clean up blob URL after download triggers
  - [ ] Handle errors at each stage with retry capability

- [ ] Task 3: Add download button and modal to App.tsx
  <!-- files: entrypoints/pdf-viewer/App.tsx, entrypoints/pdf-viewer/style.css -->
  - [ ] Import `Download` icon from `lucide-react`
  - [ ] Add download button to header controls area (after progress pill)
  - [ ] Button disabled when `translatedCount === 0` (no pages translated yet)
  - [ ] Button shows tooltip: "Download Translated PDF"
  - [ ] Wire button `onClick` to `usePdfDownload.startDownload()`
  - [ ] Render `DownloadProgressModal` when `isDownloading` is true
  - [ ] Add CSS styles for download button and modal in `style.css`

- [ ] Task 4: Write integration tests
  <!-- files: entrypoints/pdf-viewer/hooks/__tests__/usePdfDownload.test.ts, entrypoints/pdf-viewer/components/__tests__/DownloadProgressModal.test.tsx -->
  - [ ] Test: download button is disabled when no pages are translated
  - [ ] Test: download button is enabled when at least one page is translated
  - [ ] Test: `usePdfDownload` orchestrates all three stages in order
  - [ ] Test: cancel aborts in-progress translation
  - [ ] Test: error during font download shows retry in modal
  - [ ] Test: generated file has correct filename format
  - [ ] Test: DownloadProgressModal renders correct stage text
  - [ ] Test: DownloadProgressModal shows progress bar with percentage

- [ ] Task 5: Phase verification
  - [ ] Run full test suite: `pnpm test`
  - [ ] Run lint: `pnpm lint`
  - [ ] Run type check: `tsc --noEmit`
  - [ ] Build: `wxt build` — verify bundle size increase is reasonable (~90KB for pdf-lib)
  - [ ] Manual test: open a PDF, translate some pages, click Download, verify output PDF
