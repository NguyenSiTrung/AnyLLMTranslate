/**
 * PdfCanvasRenderer — Renders a single PDF page to an HTMLCanvasElement.
 *
 * Designed for use inside the left pane of the bilingual PDF viewer. Each
 * `<canvas>` is sized to the device pixel ratio so the rendered text stays
 * sharp on high-DPI displays.
 */

import { useEffect, useRef, useState } from 'react';
import { TextLayer, type PDFPageProxy } from 'pdfjs-dist';

export interface PdfCanvasRendererProps {
  /** The PDF page to render. When `null`, the renderer waits. */
  page: PDFPageProxy | null;
  /** 1-indexed page number — used to key the canvas so React reuses elements. */
  pageNumber: number;
  /** Whether the page is currently visible/near viewport. */
  visible: boolean;
  /** Pre-computed dimensions for placeholder/canvas container. */
  dims?: { width: number; height: number };
  /** Optional fixed render width in CSS pixels. Defaults to 720. */
  maxWidth?: number;
  /** Optional fixed device pixel ratio. Defaults to window.devicePixelRatio. */
  devicePixelRatio?: number;
  /** Whether to render a selectable text layer over the canvas. Defaults to true. */
  enableTextLayer?: boolean;
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
  visible,
  dims,
  maxWidth = 720,
  devicePixelRatio,
  enableTextLayer = true,
  onRendered,
  onError,
}: PdfCanvasRendererProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  // Store the latest callback props in refs so the render effect does not
  // re-run when the parent passes new closure identities on every render.
  const onRenderedRef = useRef(onRendered);
  const onErrorRef = useRef(onError);
  onRenderedRef.current = onRendered;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!page || !visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const textLayerDiv = enableTextLayer ? textLayerRef.current : null;

    const dpr = devicePixelRatio ?? window.devicePixelRatio ?? 1;
    const scale = computeScale(page, maxWidth, dpr);
    const viewport = page.getViewport({ scale });
    const textViewport = page.getViewport({ scale: scale / dpr });

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const err = new Error('Failed to acquire 2D context');
      setError(err.message);
      onErrorRef.current?.(pageNumber, err);
      return;
    }

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
    canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

    if (textLayerDiv) {
      textLayerDiv.style.width = `${Math.floor(textViewport.width)}px`;
      textLayerDiv.style.height = `${Math.floor(textViewport.height)}px`;
      textLayerDiv.style.setProperty('--scale-factor', String(textViewport.scale ?? scale / dpr));
      textLayerDiv.replaceChildren();
    }

    setError(null);
    setRendered(false);

    const renderTask = page.render({ canvasContext: ctx, viewport, intent: 'display' });
    let cancelled = false;
    let textLayer: TextLayer | null = null;

    if (textLayerDiv) {
      void page
        .getTextContent()
        .then((textContent) => {
          if (cancelled) return;
          textLayer = new TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: textViewport,
          });
          return textLayer.render();
        })
        .catch((textLayerErr: unknown) => {
          if (cancelled) return;
          if (textLayerErr instanceof Error && textLayerErr.message.includes('cancelled')) return;
        });
    }

    renderTask.promise
      .then(() => {
        setRendered(true);
        onRenderedRef.current?.(pageNumber);
      })
      .catch((renderErr: unknown) => {
        // render() can throw a TaskCancelledError — ignore that one
        if (renderErr instanceof Error && renderErr.message.includes('cancelled')) return;
        const err = renderErr instanceof Error ? renderErr : new Error(String(renderErr));
        setError(err.message);
        onErrorRef.current?.(pageNumber, err);
      });

    return () => {
      cancelled = true;
      renderTask.cancel();
      textLayer?.cancel();
    };
  }, [page, visible, pageNumber, maxWidth, devicePixelRatio, enableTextLayer]);

  const widthStyle = dims ? `${dims.width}px` : '720px';
  const heightStyle = dims ? `${dims.height}px` : '960px';

  return (
    <div
      className="pdf-viewer-page"
      data-page-number={pageNumber}
      style={{ width: widthStyle, height: heightStyle }}
    >
      {error ? (
        <div className="pdf-viewer-page-translation pdf-viewer-page-translation--error">
          Failed to render page {pageNumber}: {error}
        </div>
      ) : visible && page ? (
        <>
          <canvas
            ref={canvasRef}
            className="pdf-viewer-page-canvas"
            data-rendered={rendered}
            aria-label={`PDF page ${pageNumber}`}
          />
          {enableTextLayer && (
            <div
              ref={textLayerRef}
              className="pdf-viewer-text-layer textLayer"
              aria-label={`Selectable text for PDF page ${pageNumber}`}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
