/**
 * PdfTranslationPane — Renders the right pane (translated text) for a single
 * page, including loading skeletons, error states, and a retry button.
 *
 * Layout modes:
 * - 'text' (default): translated paragraphs in a simple vertical reading flow.
 * - 'original' (layout reference): the original page canvas (images, tables,
 *   blocks) is rendered with translated text boxes overlaid at their original
 *   positions. Boxes use natural height (no clipping/micro-fonts/popovers) and
 *   mask only the original text via an opaque white background; images/tables
 *   in uncovered areas stay visible. The page slot grows so long translations
 *   never collide with the next page.
 */

import type { PageTranslations } from '../lib/pdfTranslation';
import type { PdfParagraph } from '../lib/pdfTextExtraction';
import type { PDFPageProxy } from 'pdfjs-dist';
import { PdfCanvasRenderer } from './PdfCanvasRenderer';

export interface PdfTranslationPaneProps {
  /** 1-indexed page number this slot corresponds to. */
  pageNumber: number;
  /** Translation state for this page. */
  page: PageTranslations;
  /** Total paragraphs on the page (for skeleton count). */
  paragraphCount: number;
  /** Fired when the user clicks "Retry translation" on an error. */
  onRetry?: (pageNumber: number) => void;
  /** Current layout mode: 'original' overlay (default, visual reference) or 'text' flow (plain reading). */
  layoutMode?: 'original' | 'text';
  /** PDF page proxy for rendering the canvas background + box geometry. */
  pdfPage?: PDFPageProxy | null;
  /** Whether the page is currently visible near the viewport. */
  visible?: boolean;
  /** Pre-computed dimensions for layout overlay. */
  dims?: { width: number; height: number };
}

/** Minimum readable font size (px) for overlay text. */
const MIN_FONT_SIZE_PX = 12;
/** Maximum font size (px) cap so headings don't become absurdly large. */
const MAX_FONT_SIZE_PX = 32;
/** Default render width (px) used by PdfCanvasRenderer. */
const RENDER_WIDTH_PX = 720;

function LoadingSkeleton({ count }: { count: number }): React.ReactElement {
  // Clamp to 1-6 lines so the skeleton never looks empty or absurd
  const lines = Math.max(1, Math.min(count || 3, 6));
  return (
    <div className="pdf-viewer-page-translation pdf-viewer-page-translation--loading">
      <p className="pdf-viewer-translation-paragraph">
        <span className="pdf-viewer-spinner" aria-hidden="true" />
        Translating...
      </p>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="pdf-viewer-skeleton" style={{ width: `${85 - i * 8}%` }} />
      ))}
    </div>
  );
}

function ErrorState({
  pageNumber,
  error,
  onRetry,
}: {
  pageNumber: number;
  error?: string;
  onRetry?: (pageNumber: number) => void;
}): React.ReactElement {
  return (
    <div className="pdf-viewer-page-translation pdf-viewer-page-translation--error">
      <p className="pdf-viewer-translation-paragraph">
        <strong>Translation failed for page {pageNumber}</strong>
      </p>
      {error && (
        <p className="pdf-viewer-translation-paragraph" style={{ fontSize: '11px' }}>
          {error}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={() => onRetry(pageNumber)}
          className="pdf-viewer-retry-button"
        >
          Retry translation
        </button>
      )}
    </div>
  );
}

function EmptyState({ pageNumber }: { pageNumber: number }): React.ReactElement {
  return (
    <div className="pdf-viewer-page-translation pdf-viewer-page-translation--loading">
      <p className="pdf-viewer-translation-paragraph">
        No extractable text on page {pageNumber} (may be a scanned image).
      </p>
    </div>
  );
}

function TranslatedParagraphs({ page }: { page: PageTranslations }): React.ReactElement {
  if (page.paragraphs.size === 0) {
    return <></>;
  }
  return (
    <>
      {Array.from(page.paragraphs.entries()).map(([id, text]) => (
        <p key={id} className="pdf-viewer-translation-paragraph">
          {text}
        </p>
      ))}
    </>
  );
}

function IdleState({ pageNumber }: { pageNumber: number }): React.ReactElement {
  return (
    <div className="pdf-viewer-page-translation pdf-viewer-page-translation--idle">
      <p className="pdf-viewer-translation-paragraph">
        Page {pageNumber} — Scroll to translate
      </p>
    </div>
  );
}

type Viewport = ReturnType<PDFPageProxy['getViewport']>;

/** Estimate the rendered height (px) of a translated box for slot sizing. */
function estimateBoxHeight(text: string, widthPx: number, fontSizePx: number): number {
  const effectiveWidth = Math.max(widthPx - 6, 10);
  // Using a safer multiplier for average character width to avoid underestimation (especially for Vietnamese).
  const avgCharWidth = fontSizePx * 0.42;
  const lineHeight = fontSizePx * 1.45;
  const charsPerLine = Math.max(1, Math.floor(effectiveWidth / avgCharWidth));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  // Account for vertical padding (1px * 2) + border (1px * 2) + safety buffer for word wrap.
  return lines * lineHeight + lineHeight * 0.5 + 4;
}

/** Compute the absolute placement + sizing for one overlay box. */
function computeBoxGeometry(
  para: PdfParagraph,
  viewport: Viewport,
  pageWidth: number,
): { left: number; top: number; width: number; fontSize: number } {
  const [left, top] = viewport.convertToViewportPoint(para.x, para.y);
  const maxAvail = Math.max(40, pageWidth - left - 4);
  const width = Math.min(Math.max(para.width * viewport.scale, 40), maxAvail);
  const fontSize = Math.min(
    Math.max(para.fontSize * viewport.scale, MIN_FONT_SIZE_PX),
    MAX_FONT_SIZE_PX,
  );
  return { left, top, width, fontSize };
}

/** One translated box positioned over the original canvas. Grows to natural height. */
function LayoutOverlayBox({
  para,
  translatedText,
  left,
  top,
  width,
  fontSize,
}: {
  para: PdfParagraph;
  translatedText: string;
  left: number;
  top: number;
  width: number;
  fontSize: number;
}): React.ReactElement {
  return (
    <div
      className={`pdf-viewer-layout-para-box${para.isHeading ? ' pdf-viewer-layout-para-box--heading' : ''}`}
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        fontSize: `${fontSize}px`,
      }}
    >
      {translatedText}
    </div>
  );
}

/**
 * Layout overlay — renders the original page canvas (images/tables/blocks
 * visible) with translated text boxes overlaid at their original positions.
 * Boxes keep their original horizontal placement and reading order, but each
 * box is pushed downward if the previous translation would overlap it, so
 * long translations never collide. The container grows to fit the reflowed
 * content so the next page is pushed down instead of overlapping.
 */
function LayoutOverlay({
  page,
  pdfPage,
  dims,
}: {
  page: PageTranslations;
  pdfPage: PDFPageProxy | null;
  dims?: { width: number; height: number };
}): React.ReactElement {
  if (!pdfPage || !dims) return <></>;

  const baseViewport = pdfPage.getViewport({ scale: 1 });
  const scale = RENDER_WIDTH_PX / baseViewport.width;
  const viewport = pdfPage.getViewport({ scale });
  const originalParagraphs = page.originalParagraphs ?? [];

  // Compute every box's geometry and estimated height for reflow.
  const boxes = originalParagraphs
    .map((para) => {
      const translatedText = page.paragraphs.get(para.id);
      if (!translatedText) return null;
      const geom = computeBoxGeometry(para, viewport, dims.width);
      const estHeight = estimateBoxHeight(translatedText, geom.width, geom.fontSize);
      const origHeight = para.height * viewport.scale;
      return { para, translatedText, ...geom, estHeight, origHeight };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  // Ensure reflow follows visual reading order even if the input order drifts.
  boxes.sort((a, b) => {
    const dy = a.top - b.top;
    if (Math.abs(dy) > 2) return dy;
    return a.left - b.left;
  });

  // Reflow vertically: keep original x/width, but shift each box down if the
  // previous one would overlap it. This prevents long translations from covering
  // the next paragraph while preserving the original horizontal structure.
  const BOX_GAP = 4;
  const reflowedBoxes: Array<NonNullable<typeof boxes[number]>> = [];
  let cursorBottom = 0;
  for (const b of boxes) {
    const top = Math.max(b.top, cursorBottom + BOX_GAP);
    reflowedBoxes.push({ ...b, top });
    cursorBottom = top + b.estHeight;
  }

  const maxBottom = Math.max(dims.height, cursorBottom);
  // Only the overflow beyond the original canvas needs reserved space; the
  // canvas itself is in-flow and already occupies `dims.height`.
  const overflowHeight = Math.max(0, maxBottom - dims.height) + 16;

  return (
    <>
      {/* Render opaque white masks at the original paragraph coordinates to completely
          cover and hide the original English text on the canvas background. */}
      {boxes.map((b) => (
        <div
          key={`mask-${b.para.id}`}
          className="pdf-viewer-layout-para-mask"
          style={{
            position: 'absolute',
            left: `${b.left - 1}px`,
            top: `${b.top - 1}px`,
            width: `${b.width + 2}px`,
            height: `${b.origHeight + 2}px`,
          }}
        />
      ))}
      {/* Render the reflowed translated boxes on top of the masks. */}
      {reflowedBoxes.map((b) => (
        <LayoutOverlayBox
          key={b.para.id}
          para={b.para}
          translatedText={b.translatedText}
          left={b.left}
          top={b.top}
          width={b.width}
          fontSize={b.fontSize}
        />
      ))}
      {/* Spacer reserves vertical space so the auto-height absolute boxes that
          extend beyond the canvas push the next page down instead of colliding. */}
      <div style={{ position: 'relative', width: '100%', height: `${overflowHeight}px` }} aria-hidden="true" />
    </>
  );
}

/** Centered status box overlaid on the canvas for non-translated states. */
function LayoutStatusOverlay({
  pageNumber,
  state,
  error,
  onRetry,
}: {
  pageNumber: number;
  state: 'idle' | 'translating' | 'error' | 'empty';
  error?: string;
  onRetry?: (pageNumber: number) => void;
}): React.ReactElement {
  return (
    <div className="pdf-viewer-layout-status">
      <div className="pdf-viewer-layout-status-card">
        {state === 'idle' && <p>Page {pageNumber} — Scroll to translate</p>}
        {state === 'translating' && (
          <div className="pdf-viewer-layout-status-row">
            <span className="pdf-viewer-spinner" aria-hidden="true" />
            <span>Translating page {pageNumber}...</span>
          </div>
        )}
        {state === 'empty' && (
          <p>No extractable text on page {pageNumber} (may be a scanned image).</p>
        )}
        {state === 'error' && (
          <div>
            <p className="pdf-viewer-layout-status-error">Translation failed</p>
            {error && <p className="pdf-viewer-layout-status-detail">{error}</p>}
            {onRetry && (
              <button
                type="button"
                onClick={() => onRetry(pageNumber)}
                className="pdf-viewer-retry-button"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function PdfTranslationPane({
  pageNumber,
  page,
  paragraphCount,
  onRetry,
  layoutMode = 'text',
  pdfPage,
  visible,
  dims,
}: PdfTranslationPaneProps): React.ReactElement {
  if (layoutMode === 'original') {
    const isTranslated = page.state === 'translated';
    const isEmpty = isTranslated && page.paragraphs.size === 0;

    const status: 'idle' | 'translating' | 'error' | 'empty' | null = !isTranslated
      ? page.state === 'error'
        ? 'error'
        : page.state === 'translating'
          ? 'translating'
          : 'idle'
      : isEmpty
        ? 'empty'
        : null;

    return (
      <div
        className="pdf-viewer-layout-pane"
        style={{ position: 'relative', width: '100%', minHeight: dims ? `${dims.height}px` : undefined }}
      >
        <PdfCanvasRenderer
          page={pdfPage ?? null}
          pageNumber={pageNumber}
          visible={visible ?? false}
          dims={dims}
          enableTextLayer={false}
        />
        {status && (
          <LayoutStatusOverlay
            pageNumber={pageNumber}
            state={status}
            error={page.error}
            onRetry={onRetry}
          />
        )}
        {isTranslated && !isEmpty && (
          <LayoutOverlay page={page} pdfPage={pdfPage ?? null} dims={dims} />
        )}
      </div>
    );
  }

  // Fallback to text mode
  if (page.state === 'idle') {
    return <IdleState pageNumber={pageNumber} />;
  }
  if (page.state === 'translating') {
    return <LoadingSkeleton count={paragraphCount} />;
  }
  if (page.state === 'error') {
    return <ErrorState pageNumber={pageNumber} error={page.error} onRetry={onRetry} />;
  }
  if (page.state === 'translated' && page.paragraphs.size === 0) {
    return <EmptyState pageNumber={pageNumber} />;
  }
  return (
    <div className="pdf-viewer-page-translation">
      <TranslatedParagraphs page={page} />
    </div>
  );
}
