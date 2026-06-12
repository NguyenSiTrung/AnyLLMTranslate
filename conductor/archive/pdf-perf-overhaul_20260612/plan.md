# Plan: PDF Viewer Performance Overhaul

## Phase 1: Quick Wins — Observer Fix, Duplicate Elimination & UX
<!-- execution: parallel -->

### Task 1: Fix IntersectionObserver re-creation bug
<!-- files: entrypoints/pdf-viewer/hooks/usePdfPageTranslations.ts, entrypoints/pdf-viewer/hooks/__tests__/usePdfPageTranslations.test.tsx -->

- [ ] Add `pagesRef` (useRef) that mirrors `pages` state in `usePdfPageTranslations.ts`
- [ ] Remove `pages` from the `useEffect` dependency array (line 181)
- [ ] Use `pagesRef.current` inside the observer callback instead of stale closure
- [ ] Add test verifying observer is NOT recreated when translation state changes
- [ ] Verify existing observer root test still passes

### Task 2: Remove eager `extractAllPagesText` and duplicate text extraction
<!-- files: entrypoints/pdf-viewer/App.tsx, entrypoints/pdf-viewer/components/PdfTranslationPane.tsx -->

- [ ] Remove `paragraphCounts` state and the `extractAllPagesText` useEffect from App.tsx (lines 59-75)
- [ ] Remove the `extractAllPagesText` import from App.tsx
- [ ] Update `PdfTranslationPane` to use a default skeleton count (3-4 lines) when `paragraphCount` is 0 or not provided
- [ ] Verify that translation still works correctly (text extraction happens lazily in `translatePage`)

### Task 3: Remove double IndexedDB cache checking
<!-- files: entrypoints/pdf-viewer/lib/pdfTranslation.ts, entrypoints/pdf-viewer/lib/__tests__/pdfTranslation.test.ts -->

- [ ] Remove the viewer-side `getCachedTranslation` loop in `translateParagraphs()` (lines 110-128)
- [ ] Keep only the in-memory cache check (in `usePdfPageTranslations` hook)
- [ ] Remove `getCachedTranslation` import from `pdfTranslation.ts` (keep `cacheTranslation` for write-through)
- [ ] Update tests to reflect removed cache check behavior

### Task 4: Fix misleading idle state UX
<!-- files: entrypoints/pdf-viewer/components/PdfTranslationPane.tsx, entrypoints/pdf-viewer/style.css -->
<!-- depends: task2 -->

- [ ] Separate `idle` and `translating` states in `PdfTranslationPane` render logic
- [ ] Show subtle "Scroll to translate" placeholder for `idle` state instead of "Translating..." skeleton
- [ ] Add appropriate CSS styling for the new idle state
- [ ] Keep skeleton with "Translating..." for actual `translating` state

### Task 5: Parallel batch processing within pages
<!-- files: entrypoints/pdf-viewer/lib/pdfTranslation.ts, entrypoints/pdf-viewer/lib/__tests__/pdfTranslation.test.ts -->

- [ ] Replace sequential batch `for` loop with `Promise.all` for concurrent batch processing
- [ ] Add test verifying batches are sent concurrently
- [ ] Ensure write-through cache still works correctly with parallel results

### Task 6: Bound the in-memory cache
<!-- files: entrypoints/pdf-viewer/lib/pdfTranslation.ts, entrypoints/pdf-viewer/lib/__tests__/pdfTranslation.test.ts -->

- [ ] Add max document count limit (e.g., 10) to `memoryCache`
- [ ] Evict oldest document entry when limit is exceeded (FIFO by insertion order)
- [ ] Add test verifying eviction behavior

---

## Phase 2: Canvas Virtualization
<!-- execution: sequential -->

### Task 1: Create `useVisiblePages` hook for viewport-aware page rendering

- [ ] Create `entrypoints/pdf-viewer/hooks/useVisiblePages.ts`
- [ ] Use `IntersectionObserver` on page placeholder elements in the left pane
- [ ] Track which pages are visible with a configurable buffer (default: 2 pages ahead/behind)
- [ ] Return a `Set<number>` of page numbers that should render their canvas
- [ ] Create `entrypoints/pdf-viewer/hooks/__tests__/useVisiblePages.test.tsx`
- [ ] Add tests for visibility tracking and buffer logic

### Task 2: Refactor App.tsx to use virtualized canvas rendering

- [ ] Replace eager `pages.map(PdfCanvasRenderer)` with conditional rendering based on `useVisiblePages`
- [ ] Render lightweight placeholder `<div>` elements for non-visible pages, sized to page dimensions via `page.getViewport()`
- [ ] Only mount `<PdfCanvasRenderer>` for pages in the visible set
- [ ] Ensure scroll position is preserved when canvases mount/unmount
- [ ] Verify canvas rendering still works correctly for visible pages

### Task 3: Add tests and verify canvas virtualization

- [ ] Test that only visible pages (+buffer) have canvases mounted
- [ ] Test that scrolling triggers canvas creation/destruction
- [ ] Test that placeholder dimensions match page viewport
- [ ] Run full test suite: `pnpm test`
- [ ] Run lint: `pnpm lint`

---

## Phase 3: Progressive Page Loading & Remaining Fixes
<!-- execution: sequential -->

### Task 1: Progressive page proxy fetching

- [ ] Refactor `usePdfDocument` to stream pages progressively instead of blocking on all
- [ ] Set `loadState: 'loaded'` as soon as `doc` is available with `doc.numPages`
- [ ] Fetch first N pages (e.g., 3) immediately, then continue in background batches
- [ ] Update `pages` array incrementally as proxies become available
- [ ] Ensure `PdfCanvasRenderer` and `PdfTranslationPane` handle missing page proxies gracefully (show placeholder)
- [ ] Add test verifying first page is available before all pages are loaded

### Task 2: PDF semaphore isolation

- [ ] Identify PDF translation requests in `services/background.ts` via `pageContext.domain === 'pdf'`
- [ ] Add a dedicated semaphore for PDF translations (e.g., max 2 concurrent)
- [ ] Keep existing semaphore for regular page/subtitle translations
- [ ] Test that PDF and regular translations can proceed concurrently without blocking each other

### Task 3: Bidirectional scroll sync & smooth scroll fix

- [ ] Refactor `useSynchronizedScroll` to support both left → right AND right → left sync
- [ ] Use an update-source guard (`isUpdating` flag + `requestAnimationFrame`) to prevent feedback loops
- [ ] Use `scrollTo({ behavior: 'instant' })` for programmatic sync to avoid CSS `scroll-behavior: smooth` interference
- [ ] Test bidirectional sync behavior

### Task 4: Phase verification

- [ ] Run `pnpm test` — all tests passing
- [ ] Run `pnpm lint` — 0 lint errors
- [ ] Run `wxt build` — build succeeds
- [ ] Manual verification: open a large PDF, verify lazy canvas rendering, progressive loading, lazy translation, no duplicate extraction, bidirectional scroll
