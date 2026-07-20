/**
 * PdfDocumentPane — Renders one PDF URL into a scroll container's page stack.
 * Owns document loading + visibility virtualization for that URL.
 */

import { useMemo, useRef, type ReactElement, type RefObject } from 'react';
import { usePdfDocument } from '../hooks/usePdfDocument';
import { useVisiblePages } from '../hooks/useVisiblePages';
import { PdfCanvasRenderer } from './PdfCanvasRenderer';

export interface PdfDocumentPaneProps {
  url: string | null;
  /** Scroll container already mounted by ViewerLayout */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Optional max canvas width */
  maxWidth?: number;
}

export function PdfDocumentPane({
  url,
  containerRef,
  maxWidth = 720,
}: PdfDocumentPaneProps): ReactElement {
  const numPagesRef = useRef(0);
  const { visiblePages } = useVisiblePages({
    totalPages: numPagesRef.current,
    containerRef,
  });
  const { loadState, pages, numPages, error } = usePdfDocument(url, { visiblePages });
  numPagesRef.current = numPages;

  const pageDimensions = useMemo(() => {
    const dims = new Map<number, { width: number; height: number }>();
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (!page) continue;
      const viewport = page.getViewport({ scale: 1 });
      const scale = maxWidth / viewport.width;
      dims.set(i + 1, {
        width: Math.floor(viewport.width * scale),
        height: Math.floor(viewport.height * scale),
      });
    }
    return dims;
  }, [pages, maxWidth]);

  if (!url) {
    return (
      <div className="pdf-viewer-empty-state">
        <p>No document</p>
      </div>
    );
  }
  if (loadState === 'error') {
    return (
      <div className="pdf-viewer-empty-state pdf-viewer-empty-state--error">
        <p>{error ?? 'Failed to load PDF'}</p>
      </div>
    );
  }
  if (loadState !== 'loaded') {
    return (
      <div className="pdf-viewer-empty-state">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <>
      {Array.from({ length: numPages }, (_, idx) => {
        const pageNumber = idx + 1;
        return (
          <PdfCanvasRenderer
            key={`page-${pageNumber}`}
            page={pages[idx] ?? null}
            pageNumber={pageNumber}
            visible={visiblePages.has(pageNumber)}
            dims={pageDimensions.get(pageNumber)}
            maxWidth={maxWidth}
          />
        );
      })}
    </>
  );
}
