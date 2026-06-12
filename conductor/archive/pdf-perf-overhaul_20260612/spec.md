# Spec: PDF Viewer Performance Overhaul

## Overview

The PDF viewer currently performs several eager operations when a PDF opens, regardless of which pages the user views. While the core LLM translation is already lazy (viewport-based via IntersectionObserver), there are 11 performance issues spanning canvas rendering, text extraction, page loading, caching, and UX that need to be addressed for large PDFs (100+ pages).

## Functional Requirements

1. **Canvas Virtualization** — Only render `<canvas>` elements for pages near the viewport (~2 pages buffer). Unmount canvases that scroll far out of view to reclaim GPU memory.
2. **Progressive Page Proxy Fetching** — Don't block the first render on fetching all `PDFPageProxy` objects. Show pages as soon as their proxies are available.
3. **Fix Observer Re-creation Bug** — Remove `pages` (translation state) from the `usePdfPageTranslations` useEffect dependency array to prevent observer teardown/rebuild on every translation completion.
4. **Remove Duplicate Text Extraction** — Remove the eager `extractAllPagesText()` call in App.tsx. Use default skeleton counts; populate actual counts as a side-effect of lazy translation.
5. **Remove Double Cache Checking** — Remove the viewer-side IndexedDB cache check in `pdfTranslation.ts` (keep background-side). Retain the fast in-memory cache.
6. **Parallel Batch Processing** — Process translation batches within a page concurrently instead of sequentially.
7. **Bound In-Memory Cache** — Add LRU eviction or document-count limit to `pdfTranslation.ts` memoryCache.
8. **PDF Semaphore Isolation** — Give PDF translations a dedicated semaphore or priority lane so they don't compete with regular page translations.
9. **Fix Misleading Idle State** — Show a distinct "Waiting for scroll" placeholder for pages in `idle` state instead of "Translating...".
10. **Bidirectional Scroll Sync** — Allow scrolling from either pane to drive navigation.
11. **Fix Smooth Scroll Conflict** — Ensure `scroll-behavior: smooth` doesn't interfere with programmatic scroll sync.

## Non-Functional Requirements

- All 917+ existing tests must continue passing
- No visible regression in translation quality or behavior
- Memory usage for large PDFs (200+ pages) should drop from ~1.1GB to <50MB for canvas rendering
- Time-to-first-page-render should improve for large PDFs

## Acceptance Criteria

- [ ] Opening a 200-page PDF only renders ~5 canvases (visible + buffer)
- [ ] Page 1 renders before all page proxies are fetched
- [ ] IntersectionObserver is not recreated when translation state changes
- [ ] Text extraction only runs once per page (during translation, not on mount)
- [ ] IndexedDB cache is checked only once per paragraph (background side only)
- [ ] Translation batches within a page process concurrently
- [ ] In-memory cache has a bound (e.g., max 10 documents)
- [ ] PDF translations don't block regular page translations
- [ ] Idle pages show "Waiting" not "Translating..."
- [ ] Both panes support scroll-driven navigation
- [ ] No scroll jitter from CSS smooth scroll
- [ ] All existing tests pass, new tests added for key changes
- [ ] `pnpm test` and `pnpm lint` pass

## Out of Scope

- Redesigning the PDF viewer UI/layout
- Supporting scanned/image-only PDFs (OCR)
- PDF rendering quality improvements
- Adding new features to the PDF viewer
