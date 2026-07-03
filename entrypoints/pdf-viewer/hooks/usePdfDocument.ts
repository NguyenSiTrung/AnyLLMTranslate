/**
 * usePdfDocument — loads a PDF URL into PDF.js and progressively streams
 * page proxies.
 *
 * Instead of blocking on all pages before showing the viewer, this hook:
 * 1. Downloads the PDF binary.
 * 2. Once the document is parsed, sets `loadState: 'loaded'` and returns
 *    `numPages` immediately so the UI can render placeholders.
 * 3. Fetches page proxies in small batches (default: 3 at a time),
 *    updating `pages` incrementally as they become available.
 *
 * This allows PdfCanvasRenderer and the virtualization hook to start
 * rendering the first visible pages without waiting for every page proxy.
 */

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { loadPdfDocument } from '../lib/pdfLoader';

export type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

/** Number of page proxies to fetch per batch during progressive loading. */
const PAGES_PER_BATCH = 3;

export interface UsePdfDocumentResult {
  /** Loading state of the document. */
  loadState: LoadState;
  /** Loaded document, or `null` while loading / on error. */
  document: PDFDocumentProxy | null;
  /** Pages of the document (filled progressively — may have `null` gaps). */
  pages: Array<PDFPageProxy | null>;
  /** Total number of pages in the document (available once loaded). */
  numPages: number;
  /** Bytes loaded (0..total) while the document is downloading. */
  bytesLoaded: number;
  /** Total bytes of the PDF, once known. */
  bytesTotal: number;
  /** Human-readable error message when `loadState === 'error'`. */
  error: string | null;
}

export interface UsePdfDocumentOptions {
  /**
   * Set of 1-indexed page numbers currently considered visible (or buffered).
   * When provided together with `evictionWindow`, page proxies outside the
   * window are evicted from memory (`.cleanup()`) and re-fetched via
   * `getPage()` when they re-enter the window.
   *
   * Extracted text + translations are cached upstream (pdfTranslation.ts
   * memoryCache + IndexedDB), so re-entering an evicted page does NOT
   * re-translate — only the pdf.js proxy object is re-fetched (cheap).
   */
  visiblePages?: Set<number>;
  /**
   * Number of pages above and below each visible page to keep resident.
   * Defaults to 5. Only consulted when `visiblePages` is provided.
   */
  evictionWindow?: number;
}

/** Load and hold a PDF document for the lifetime of the page. */
export function usePdfDocument(
  url: string | null,
  options?: UsePdfDocumentOptions,
): UsePdfDocumentResult {
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<Array<PDFPageProxy | null>>([]);
  const [numPages, setNumPages] = useState(0);
  const [bytesLoaded, setBytesLoaded] = useState(0);
  const [bytesTotal, setBytesTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setLoadState('idle');
    setDocument(null);
    setPages([]);
    setNumPages(0);
    setBytesLoaded(0);
    setBytesTotal(0);
    setError(null);

    if (!url) {
      setError('No PDF URL provided');
      setLoadState('error');
      return;
    }

    setLoadState('loading');
    loadPdfDocument({
      url,
      onProgress: (loaded, total) => {
        if (cancelledRef.current) return;
        setBytesLoaded(loaded);
        setBytesTotal(total);
      },
    })
      .then(async (doc) => {
        if (cancelledRef.current) {
          await doc.destroy();
          return;
        }
        setDocument(doc);
        setNumPages(doc.numPages);

        // Initialize the pages array with null placeholders
        const initialPages: Array<PDFPageProxy | null> = new Array(doc.numPages).fill(null);
        setPages(initialPages);

        // Set loaded immediately so the UI can render placeholders
        setLoadState('loaded');

        // Progressively fetch page proxies in batches
        for (let i = 0; i < doc.numPages; i += PAGES_PER_BATCH) {
          if (cancelledRef.current) return;

          const batchEnd = Math.min(i + PAGES_PER_BATCH, doc.numPages);
          const batchPromises: Promise<PDFPageProxy>[] = [];
          for (let j = i; j < batchEnd; j++) {
            batchPromises.push(doc.getPage(j + 1)); // 1-indexed
          }

          const batchPages = await Promise.all(batchPromises);
          if (cancelledRef.current) {
            await Promise.all(batchPages.map((p) => p.cleanup()));
            return;
          }

          // Update pages array with the newly fetched proxies
          setPages((prev) => {
            const next = [...prev];
            for (let j = 0; j < batchPages.length; j++) {
              next[i + j] = batchPages[j];
            }
            return next;
          });
        }
      })
      .catch((err: unknown) => {
        if (cancelledRef.current) return;
        const message = err instanceof Error ? err.message : 'Failed to load PDF';
        setError(message);
        setLoadState('error');
      });

    return () => {
      cancelledRef.current = true;
    };
  }, [url]);

  // Cleanup document on unmount
  useEffect(() => {
    return () => {
      if (document) {
        document.destroy().catch(() => {});
      }
    };
  }, [document]);

  // ---------------------------------------------------------------------------
  // Page-proxy window eviction (large-document memory management).
  //
  // When `visiblePages` is provided, page proxies outside the ±evictionWindow
  // of any visible page are evicted (`.cleanup()` + set to `null`). Proxies
  // that should be resident but are currently `null` (e.g. re-entering a
  // previously-evicted page) are re-fetched via `getPage()`.
  //
  // IMPORTANT: this evicts ONLY pdf.js proxy objects. Extracted text and
  // translations live in the upstream cache (pdfTranslation.ts memoryCache +
  // IndexedDB), which is independent of these proxies — so scrolling back to
  // an evicted page re-renders from cache without a new LLM call.
  // ---------------------------------------------------------------------------
  const pagesRef = useRef<Array<PDFPageProxy | null>>(pages);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    if (!document) return;
    const visiblePages = options?.visiblePages;
    // Only run eviction when a visible set is explicitly provided.
    if (!visiblePages) return;
    const evictionWindow = options?.evictionWindow ?? 5;

    // Compute the set of page numbers that should remain resident.
    const keep = new Set<number>();
    for (const page of visiblePages) {
      const lo = Math.max(1, page - evictionWindow);
      const hi = Math.min(numPages, page + evictionWindow);
      for (let i = lo; i <= hi; i++) keep.add(i);
    }

    // Decide eviction + missing in a single pass over the current array.
    const current = pagesRef.current;
    const toEvict: PDFPageProxy[] = [];
    const missing: number[] = [];
    let changed = false;
    const next = current.map((proxy, idx) => {
      const pageNumber = idx + 1;
      if (!keep.has(pageNumber)) {
        if (proxy !== null) {
          toEvict.push(proxy);
          changed = true;
          return null;
        }
        return null; // already evicted
      }
      // Page should be resident.
      if (proxy === null) {
        missing.push(pageNumber);
        changed = true;
      }
      return proxy;
    });

    if (toEvict.length > 0) {
      for (const proxy of toEvict) {
        // PDFPageProxy.cleanup() is synchronous and returns a boolean; wrap in
        // try/catch defensively in case a future pdf.js version throws.
        try {
          proxy.cleanup();
        } catch {
          /* best-effort */
        }
      }
    }

    if (changed) {
      setPages(next);
    }

    // Re-fetch missing pages that should be resident (best-effort, guarded
    // against unmount via cancelledRef).
    if (missing.length > 0) {
      void (async () => {
        const fetched = new Map<number, PDFPageProxy>();
        await Promise.all(
          missing.map(async (pageNumber) => {
            if (cancelledRef.current) return;
            try {
              const proxy = await document.getPage(pageNumber);
              if (cancelledRef.current) {
                try {
                  proxy.cleanup();
                } catch {
                  /* best-effort */
                }
                return;
              }
              fetched.set(pageNumber, proxy);
            } catch {
              // Best-effort: leave the slot null; render path handles null.
            }
          }),
        );
        if (fetched.size === 0) return;
        setPages((prev) => {
          const updated = [...prev];
          for (const [pageNumber, proxy] of fetched) {
            // Only fill if still expected (a rapid re-render may have evicted).
            if (updated[pageNumber - 1] === null) {
              updated[pageNumber - 1] = proxy;
            } else {
              try {
                proxy.cleanup();
              } catch {
                /* best-effort */
              }
            }
          }
          return updated;
        });
      })();
    }
  }, [document, options?.visiblePages, options?.evictionWindow, numPages]);

  return { loadState, document, pages, numPages, bytesLoaded, bytesTotal, error };
}
