/**
 * usePdfDocument — loads a PDF URL into PDF.js and tracks page-by-page readiness.
 *
 * Returns the loaded `PDFDocumentProxy`, a list of `PDFPageProxy` objects (one
 * per page, requested eagerly so canvas rendering can begin), and load-state
 * flags for the UI to render progress and error states.
 */

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { loadPdfDocument } from '../lib/pdfLoader';

export type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

export interface UsePdfDocumentResult {
  /** Loading state of the document. */
  loadState: LoadState;
  /** Loaded document, or `null` while loading / on error. */
  document: PDFDocumentProxy | null;
  /** Pages of the document (filled eagerly on load). */
  pages: PDFPageProxy[];
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
  const [pages, setPages] = useState<PDFPageProxy[]>([]);
  const [bytesLoaded, setBytesLoaded] = useState(0);
  const [bytesTotal, setBytesTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setLoadState('idle');
    setDocument(null);
    setPages([]);
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
        // Eagerly fetch all pages so the renderer can begin canvas work
        const fetched: PDFPageProxy[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelledRef.current) {
            await Promise.all(fetched.map((p) => p.cleanup()));
            await doc.destroy();
            return;
          }
          const page = await doc.getPage(i);
          fetched.push(page);
        }
        if (cancelledRef.current) {
          await Promise.all(fetched.map((p) => p.cleanup()));
          await doc.destroy();
          return;
        }
        setPages(fetched);
        setLoadState('loaded');
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

  return { loadState, document, pages, bytesLoaded, bytesTotal, error };
}
