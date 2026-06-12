/**
 * PdfCanvasRenderer — Renders a single PDF page to an HTMLCanvasElement.
 *
 * Designed for use inside the left pane of the bilingual PDF viewer. Each
 * `<canvas>` is sized to the device pixel ratio so the rendered text stays
 * sharp on high-DPI displays.
 */

import { useEffect, useRef, useState } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';

export interface PdfCanvasRendererProps {
  /** The PDF page to render. When `null`, the renderer waits. */
  page: PDFPageProxy | null;
  /** 1-indexed page number — used to key the canvas so React reuses elements. */
  pageNumber: number;
  /** Optional fixed render width in CSS pixels. Defaults to 720. */
  maxWidth?: number;
  /** Optional fixed device pixel ratio. Defaults to window.devicePixelRatio. */
  devicePixelRatio?: number;
  /** Fired once the canvas finishes rendering for this page. */
  onRendered?: (pageNumber: number) => void;
  /** Fired on render error. */
  onError?: (pageNumber: number, error: Error) => void;
}

/** Scale a PDF page to fit within `maxWidth` CSS pixels. */
function computeScale(page: PDFPageProxy, maxWidth: number, dpr: number): number {
  const baseViewport = page.getViewport({ scale: 1 });
  const cssScale = maxWidth / baseViewport.width;
  // Clamp to a reasonable range — pages can be 2000+ units wide
  return Math.max(0.5, Math.min(cssScale * dpr, 4));
}

export function PdfCanvasRenderer({
  page,
  pageNumber,
  maxWidth = 720,
  devicePixelRatio,
  onRendered,
  onError,
}: PdfCanvasRendererProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!page) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = devicePixelRatio ?? window.devicePixelRatio ?? 1;
    const scale = computeScale(page, maxWidth, dpr);
    const viewport = page.getViewport({ scale });

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const err = new Error('Failed to acquire 2D context');
      setError(err.message);
      onError?.(pageNumber, err);
      return;
    }

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
    canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

    setError(null);
    setRendered(false);

    const renderTask = page.render({ canvasContext: ctx, viewport, intent: 'display' });

    renderTask.promise
      .then(() => {
        setRendered(true);
        onRendered?.(pageNumber);
      })
      .catch((renderErr: unknown) => {
        // render() can throw a TaskCancelledError — ignore that one
        if (renderErr instanceof Error && renderErr.message.includes('cancelled')) return;
        const err = renderErr instanceof Error ? renderErr : new Error(String(renderErr));
        setError(err.message);
        onError?.(pageNumber, err);
      });

    return () => {
      renderTask.cancel();
    };
  }, [page, pageNumber, maxWidth, devicePixelRatio, onRendered, onError]);

  return (
    <div className="pdf-viewer-page" data-page-number={pageNumber}>
      {error ? (
        <div className="pdf-viewer-page-translation pdf-viewer-page-translation--error">
          Failed to render page {pageNumber}: {error}
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="pdf-viewer-page-canvas"
          data-rendered={rendered}
          aria-label={`PDF page ${pageNumber}`}
        />
      )}
    </div>
  );
}
