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

import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
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

/**
 * Conservative lower-bound estimate of a translated box's rendered height.
 *
 * Used as a floor under the live DOM measurement: in a real browser we prefer
 * the actual `getBoundingClientRect().height` (which accounts for tall stacking
 * diacritics like Vietnamese `ệ`, `ỗ` and for CJK). The estimate only kicks in
 * when layout is unavailable (jsdom tests, hidden containers) so the reflow
 * never silently under-flows there either.
 */
function estimateBoxHeight(text: string, widthPx: number, fontSizePx: number): number {
  const effectiveWidth = Math.max(widthPx - 6, 10);
  // Generous avg char width so we err toward *more* lines (taller boxes),
  // which is the safe direction for collision avoidance.
  const avgCharWidth = fontSizePx * 0.5;
  const lineHeight = fontSizePx * 1.45;
  const charsPerLine = Math.max(1, Math.floor(effectiveWidth / avgCharWidth));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
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
  // For headings, use the full available width from left edge to right margin.
  // Headings like "1 INTRODUCTION" have a narrow original width in PDF space,
  // but their translated text can be much longer and would be truncated if
  // constrained to the original paragraph width.
  const baseWidth = para.isHeading
    ? maxAvail
    : Math.max(para.width * viewport.scale, 40);
  const width = Math.min(baseWidth, maxAvail);
  const fontSize = Math.min(
    Math.max(para.fontSize * viewport.scale, MIN_FONT_SIZE_PX),
    MAX_FONT_SIZE_PX,
  );
  return { left, top, width, fontSize };
}

/** One translated box positioned over the original canvas. Grows to natural height. */
const LayoutOverlayBox = forwardRef<
  HTMLDivElement,
  {
    para: PdfParagraph;
    translatedText: string;
    left: number;
    top: number;
    width: number;
    fontSize: number;
  }
>(function LayoutOverlayBox({ para, translatedText, left, top, width, fontSize }, ref) {
  return (
    <div
      ref={ref}
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
});

/**
 * Layout overlay — renders the original page canvas (images/tables/blocks
 * visible) with translated text boxes overlaid at their original positions.
 *
 * Reflow strategy: render boxes at their original `top`, then in a
 * `useLayoutEffect` measure each rendered box's actual height (via
 * `getBoundingClientRect`) and shift any box down so it never overlaps the
 * one above. Measuring the real DOM — instead of guessing line counts from
 * an `avgCharWidth` heuristic — is what keeps scripts with tall stacking
 * diacritics (Vietnamese `ệ`, `ỗ`, `ầ`, …) and CJK from colliding.
 *
 * The container's reserved height is derived from the largest measured
 * bottom so auto-height boxes that extend past the canvas push the next
 * page down instead of overlapping it.
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
  // P0 (Rules of Hooks): The conditional early-return lives in this wrapper. The
  // actual hook-using body is in LayoutOverlayInner, which only mounts once both
  // pdfPage and dims are available — so its hooks always run with valid data and
  // in a stable order. Rendering <></> here never interleaves with hook calls.
  if (!pdfPage || !dims) return <></>;
  return <LayoutOverlayInner page={page} pdfPage={pdfPage} dims={dims} />;
}

function LayoutOverlayInner({
  page,
  pdfPage,
  dims,
}: {
  page: PageTranslations;
  pdfPage: PDFPageProxy;
  dims: { width: number; height: number };
}): React.ReactElement {
  const baseViewport = pdfPage.getViewport({ scale: 1 });
  const scale = RENDER_WIDTH_PX / baseViewport.width;
  const viewport = pdfPage.getViewport({ scale });
  const originalParagraphs = page.originalParagraphs ?? [];

  // Pre-compute static geometry. `top` is the ORIGINAL position here; the
  // effect below may override it after measuring the rendered boxes.
  const boxes = originalParagraphs
    .map((para) => {
      const translatedText = page.paragraphs.get(para.id);
      if (!translatedText) return null;
      // Skip overlay rendering if the text is kept verbatim/untranslated
      // (e.g. math formulas, figures, or hidden OCR metadata). Since it is
      // already in the background canvas, rendering it again causes redundant
      // white boxes and text overlaps.
      if (translatedText.trim() === para.text.trim()) return null;
      const geom = computeBoxGeometry(para, viewport, dims.width);
      const origHeight = para.height * viewport.scale;
      // Conservative floor: only used when the live measurement is unavailable
      // (e.g. jsdom has no layout). In a real browser the measured height wins.
      const estHeight = estimateBoxHeight(translatedText, geom.width, geom.fontSize);
      return { para, translatedText, origHeight, estHeight, ...geom };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  // Ensure reflow follows visual reading order even if the input order drifts.
  boxes.sort((a, b) => {
    const dy = a.top - b.top;
    if (Math.abs(dy) > 2) return dy;
    return a.left - b.left;
  });

  // tops[i] = the `top` CSS px for boxes[i]. Initialized to the original `top`,
  // then corrected after measuring real DOM heights.
  const [tops, setTops] = useState<number[]>(() => boxes.map((b) => b.top));
  const boxRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [containerHeight, setContainerHeight] = useState<number>(dims.height);
  // Last containerHeight we committed; tracked in a ref so the effect can diff
  // against it without depending on the state value (which would re-trigger it).
  const lastContainerHeightRef = useRef<number>(dims.height);

  // Re-run the reflow only when the set of translated texts or the page height
  // changes. Using a derived key (instead of the `boxes` array, which is a new
  // reference every render) avoids an infinite measure → setTops → measure loop.
  const translationsKey = boxes.map((b) => b.translatedText).join('\u0001');

  useLayoutEffect(() => {
    if (boxes.length === 0) {
      if (lastContainerHeightRef.current !== dims.height) {
        lastContainerHeightRef.current = dims.height;
        setContainerHeight(dims.height);
      }
      return;
    }

    // First pass: place each box at the larger of its original `top` or the
    // bottom of the previous box (so we measure against the final position).
    const nextTops: number[] = new Array(boxes.length);
    const BOX_GAP = 4;
    let cursorBottom = 0;
    let maxBottom = dims.height;

    for (let i = 0; i < boxes.length; i++) {
      const desiredTop = Math.max(boxes[i].top, cursorBottom + BOX_GAP);
      nextTops[i] = desiredTop;

      // Prefer the real, measured height of the rendered box. Fall back to the
      // conservative estimate when layout is unavailable (e.g. jsdom) — never go
      // below the estimate, since under-estimating is what causes overlaps.
      const el = boxRefs.current[i];
      const measured = el ? el.getBoundingClientRect().height : 0;
      const h = Math.max(measured, boxes[i].estHeight);
      cursorBottom = desiredTop + h;
      if (cursorBottom > maxBottom) maxBottom = cursorBottom;
    }

    const prevTops = tops;
    const topsChanged = nextTops.some((t, i) => Math.abs(t - (prevTops[i] ?? t)) > 0.5);
    if (topsChanged) setTops(nextTops);

    // Reserve a small buffer so box borders/descenders never kiss the next page.
    const nextContainerHeight = maxBottom + 16;
    if (Math.abs(nextContainerHeight - lastContainerHeightRef.current) > 0.5) {
      lastContainerHeightRef.current = nextContainerHeight;
      setContainerHeight(nextContainerHeight);
    }
  }, [translationsKey, dims.height, boxes.length]);

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
      {/* Render the translated boxes at the (measure-corrected) tops. */}
      {boxes.map((b, i) => (
        <LayoutOverlayBox
          key={b.para.id}
          ref={(el) => {
            boxRefs.current[i] = el;
          }}
          para={b.para}
          translatedText={b.translatedText}
          left={b.left}
          top={tops[i] ?? b.top}
          width={b.width}
          fontSize={b.fontSize}
        />
      ))}
      {/* Spacer reserves vertical space so the auto-height absolute boxes that
          extend beyond the canvas push the next page down instead of colliding. */}
      <div style={{ position: 'relative', width: '100%', height: `${Math.max(0, containerHeight - dims.height)}px` }} aria-hidden="true" />
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
