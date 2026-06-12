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

/** Load and hold a PDF document for the lifetime of the page. */
export function usePdfDocument(url: string | null): UsePdfDocumentResult {
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

  return { loadState, document, pages, numPages, bytesLoaded, bytesTotal, error };
}
