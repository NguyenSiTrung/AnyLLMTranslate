/**
 * PdfTranslationPane — Renders the right pane for a single page: the original
 * page canvas with translated text boxes overlaid at their original positions.
 *
 * Boxes use natural height (no clipping/micro-fonts/popovers) and mask only the
 * original text via an opaque white background; images/tables in uncovered
 * areas stay visible. The page slot grows so long translations never collide
 * with the next page.
 */

import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PageTranslations } from '../lib/pdfTranslation';
import type { PdfParagraph } from '../lib/pdfTextExtraction';
import {
  getProseMaskRects,
  paragraphHasFormulaRuns,
  proseOnlyOverlayText,
  shouldSkipLayoutOverlay,
} from '../lib/pdfComposition';
import type { PDFPageProxy } from 'pdfjs-dist';
import { PdfCanvasRenderer } from './PdfCanvasRenderer';
import { createCanvasMetricsHook, measureBoxHeight } from '../lib/fontMetrics';
import { fitTextToBox } from '../lib/pdfTypesetting';
import { isOcrWorkaroundActive } from '../lib/pdfScanSession';
import { formatCooldownRemaining } from '@/lib/poolDashboardStatus';

export interface PdfTranslationPaneProps {
  /** 1-indexed page number this slot corresponds to. */
  pageNumber: number;
  /** Translation state for this page. */
  page: PageTranslations;
  /** Fired when the user clicks "Retry translation" on an error. */
  onRetry?: (pageNumber: number) => void;
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

/**
 * Live tick while a pool-cooling window is active. Returns remaining label
 * and whether Retry should be enabled.
 */
function useCoolingCountdown(retryAfter?: number): {
  cooling: boolean;
  remainingLabel: string;
} {
  const [now, setNow] = useState(() => Date.now());
  const active = retryAfter !== undefined && retryAfter > now;

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active, retryAfter]);

  if (retryAfter === undefined || retryAfter <= now) {
    return { cooling: false, remainingLabel: '' };
  }
  return {
    cooling: true,
    remainingLabel: formatCooldownRemaining(retryAfter, now),
  };
}

/**
 * Font stack used by the layout boxes — must match the CSS inherited font on
 * `.pdf-viewer-root` (style.css) so canvas `measureText` reflects the actual
 * rendered glyphs. Used by the font-metrics helper for accurate pre-paint
 * height computation.
 */
const LAYOUT_BOX_FONT_FAMILY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/**
 * Accurate pre-paint height estimate for a translated overlay box.
 *
 * Delegates to the canvas-based font-metrics helper (`measureBoxHeight`),
 * which measures real per-word glyph widths (handling tall stacking
 * diacritics like Vietnamese `ệ`, `ỗ` and CJK) rather than the crude
 * `chars × avgCharWidth` heuristic. This makes the FIRST-paint box positions
 * match the final post-reflow layout — no collision flash, no layout-thrash.
 *
 * The live DOM `getBoundingClientRect` measurement in the reflow effect still
 * wins when available (it accounts for sub-pixel rounding + any CSS the
 * metrics helper doesn't model); this estimate is the floor that guarantees
 * the first paint is already correct.
 */
function estimateBoxHeight(text: string, widthPx: number, fontSizePx: number): number {
  return measureBoxHeight(text, widthPx, {
    fontFamily: LAYOUT_BOX_FONT_FAMILY,
    fontSize: fontSizePx,
  }).height;
}

/** Shared canvas metrics for the typesetting ladder (Layout overlay). */
const layoutMetricsHook = createCanvasMetricsHook(LAYOUT_BOX_FONT_FAMILY);

type Viewport = ReturnType<PDFPageProxy['getViewport']>;

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

/** One translated box positioned over the original canvas.
 *  Height is hard-capped (`maxHeight`) so a long Vietnamese translation cannot
 *  paint its white background over the next display equation on the canvas. */
const LayoutOverlayBox = forwardRef<
  HTMLDivElement,
  {
    para: PdfParagraph;
    translatedText: string;
    left: number;
    top: number;
    width: number;
    fontSize: number;
    lineHeight: number;
    /** Hard max height in CSS px; overflow is clipped. */
    maxHeight: number;
  }
>(function LayoutOverlayBox(
  { para, translatedText, left, top, width, fontSize, lineHeight, maxHeight },
  ref,
) {
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
        lineHeight: String(lineHeight),
        maxHeight: `${Math.max(12, maxHeight)}px`,
        overflow: 'hidden',
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
  const BOX_GAP = 4;

  // Viewport Y bands for EVERY original paragraph (overlay + skipped math).
  // Hard-cap overlay height so long translations cannot white-paint over the
  // next display equation left on the canvas.
  const allBands = originalParagraphs
    .map((para) => {
      const [, top] = viewport.convertToViewportPoint(para.x, para.y);
      const height = Math.max(para.height * viewport.scale, 12);
      return { id: para.id, top, bottom: top + height };
    })
    .sort((a, b) => a.top - b.top || a.id.localeCompare(b.id));

  /** Max CSS px height for a box starting at `top` before the next band. */
  const maxHeightFromTop = (top: number, paraId: string): number => {
    let nextTop = dims.height;
    for (const band of allBands) {
      if (band.id === paraId) continue;
      if (band.top > top + 1) {
        nextTop = Math.min(nextTop, band.top);
        break;
      }
    }
    return Math.max(12, nextTop - top - BOX_GAP);
  };

  // Pre-compute static geometry. `top` is the ORIGINAL position here; the
  // effect below may override it after measuring the rendered boxes.
  // Masks shift by the same deltaY as the text box during reflow.
  const boxes = originalParagraphs
    .map((para) => {
      const fullTranslated = page.paragraphs.get(para.id);
      if (!fullTranslated) return null;
      const kind = page.paragraphKinds?.get(para.id);
      // Failsafe: display equations / pure math / tofu → keep canvas only.
      if (shouldSkipLayoutOverlay(para, kind, fullTranslated)) return null;
      const compositions = page.paragraphCompositions?.get(para.id);
      const overlayText = proseOnlyOverlayText(fullTranslated, compositions, para);
      if (!overlayText) return null;

      let maskRects = getProseMaskRects(para, kind, fullTranslated);
      if (!maskRects || maskRects.length === 0) return null;
      if (
        isOcrWorkaroundActive() &&
        kind !== 'math' &&
        kind !== 'figure' &&
        !paragraphHasFormulaRuns(para)
      ) {
        maskRects = [
          {
            x: para.x,
            y: para.y,
            width: Math.max(para.width, 1),
            height: Math.max(para.height, 1),
          },
        ];
      }
      const geom = computeBoxGeometry(para, viewport, dims.width);
      const origHeight = Math.max(para.height * viewport.scale, 12);
      // Never paint past the next original paragraph band (skipped math lives there).
      const maxHeight = maxHeightFromTop(geom.top, para.id);
      const fitHeight = Math.min(origHeight, maxHeight);
      const freeDown = Math.max(0, maxHeight - origHeight);
      const freeRight = Math.max(0, dims.width - geom.left - geom.width - 4);
      const fit = fitTextToBox({
        box: {
          x: geom.left,
          y: geom.top,
          width: geom.width,
          height: fitHeight,
        },
        text: overlayText,
        naturalFontSize: geom.fontSize,
        metrics: layoutMetricsHook,
        freeSpace: { right: freeRight, down: freeDown },
      });
      const fittedFontSize = fit.fontSize;
      const fittedWidth = Math.min(fit.box.width, geom.width + freeRight);
      const fittedLineHeight = fit.lineHeight;
      const rawEst = fit.overflow
        ? estimateBoxHeight(overlayText, fittedWidth, fittedFontSize)
        : Math.max(
            fit.box.height,
            layoutMetricsHook.measure({
              text: overlayText,
              fontSize: fittedFontSize,
              lineHeight: fittedLineHeight,
              width: fittedWidth,
            }).height,
          );
      const estHeight = Math.min(rawEst, maxHeight);
      const viewportMasks = maskRects.map((r) => {
        const [left, top] = viewport.convertToViewportPoint(r.x, r.y);
        const [, bottom] = viewport.convertToViewportPoint(r.x, r.y - r.height);
        const rawH = Math.max(Math.abs(bottom - top), 2);
        const capH = Math.min(rawH, maxHeightFromTop(top, para.id));
        return {
          left,
          top,
          width: Math.max(r.width * viewport.scale, 2),
          height: capH,
        };
      });
      return {
        para,
        translatedText: overlayText,
        origHeight,
        estHeight,
        maxHeight,
        viewportMasks,
        left: geom.left,
        top: geom.top,
        width: fittedWidth,
        fontSize: fittedFontSize,
        lineHeight: fittedLineHeight,
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  boxes.sort((a, b) => {
    const dy = a.top - b.top;
    if (Math.abs(dy) > 2) return dy;
    return a.left - b.left;
  });

  // Canvas bands with no overlay (display math) — reflow must jump over these.
  const overlayIds = new Set(boxes.map((b) => b.para.id));
  const protectedBands = allBands.filter((b) => !overlayIds.has(b.id));

  const [tops, setTops] = useState<number[]>(() => boxes.map((b) => b.top));
  const boxRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [containerHeight, setContainerHeight] = useState<number>(dims.height);
  const lastContainerHeightRef = useRef<number>(dims.height);

  const translationsKey = boxes.map((b) => b.translatedText).join('\u0001');

  useLayoutEffect(() => {
    if (boxes.length === 0) {
      if (lastContainerHeightRef.current !== dims.height) {
        lastContainerHeightRef.current = dims.height;
        setContainerHeight(dims.height);
      }
      return;
    }

    const nextTops: number[] = new Array(boxes.length);
    let cursorBottom = 0;
    let maxBottom = dims.height;

    for (let i = 0; i < boxes.length; i++) {
      let desiredTop = Math.max(boxes[i].top, cursorBottom + BOX_GAP);

      // Jump below protected math bands so a tall prose box is not placed on them.
      for (const band of protectedBands) {
        if (desiredTop < band.bottom - 1 && desiredTop + 8 > band.top) {
          desiredTop = Math.max(desiredTop, band.bottom + BOX_GAP);
        }
      }

      nextTops[i] = desiredTop;

      const heightCap = Math.min(
        boxes[i].maxHeight,
        maxHeightFromTop(desiredTop, boxes[i].para.id),
      );
      const el = boxRefs.current[i];
      const measured = el ? el.getBoundingClientRect().height : 0;
      const h = Math.min(Math.max(measured, boxes[i].estHeight), heightCap);
      cursorBottom = desiredTop + h;
      if (cursorBottom > maxBottom) maxBottom = cursorBottom;
    }

    const prevTops = tops;
    const topsChanged = nextTops.some((t, i) => Math.abs(t - (prevTops[i] ?? t)) > 0.5);
    if (topsChanged) setTops(nextTops);

    const nextContainerHeight = maxBottom + 16;
    if (Math.abs(nextContainerHeight - lastContainerHeightRef.current) > 0.5) {
      lastContainerHeightRef.current = nextContainerHeight;
      setContainerHeight(nextContainerHeight);
    }
  }, [translationsKey, dims.height, boxes.length]);

  return (
    <>
      {boxes.flatMap((b, i) => {
        const placedTop = tops[i] ?? b.top;
        const deltaY = placedTop - b.top;
        const heightCap = Math.min(b.maxHeight, maxHeightFromTop(placedTop, b.para.id));
        return b.viewportMasks.map((m, mi) => (
          <div
            key={`mask-${b.para.id}-${mi}`}
            className="pdf-viewer-layout-para-mask"
            style={{
              position: 'absolute',
              left: `${m.left - 1}px`,
              top: `${m.top + deltaY - 1}px`,
              width: `${m.width + 2}px`,
              height: `${Math.min(m.height + 2, heightCap + 2)}px`,
            }}
          />
        ));
      })}
      {boxes.map((b, i) => {
        const placedTop = tops[i] ?? b.top;
        const heightCap = Math.min(b.maxHeight, maxHeightFromTop(placedTop, b.para.id));
        return (
          <LayoutOverlayBox
            key={b.para.id}
            ref={(el) => {
              boxRefs.current[i] = el;
            }}
            para={b.para}
            translatedText={b.translatedText}
            left={b.left}
            top={placedTop}
            width={b.width}
            fontSize={b.fontSize}
            lineHeight={b.lineHeight}
            maxHeight={heightCap}
          />
        );
      })}
      {/* Spacer reserves vertical space so absolute boxes that still extend past
          the canvas push the next page down instead of colliding. */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: `${Math.max(0, containerHeight - dims.height)}px`,
        }}
        aria-hidden="true"
      />
    </>
  );
}

/** Centered status box overlaid on the canvas for non-translated states. */
function LayoutStatusOverlay({
  pageNumber,
  state,
  error,
  retryAfter,
  onRetry,
}: {
  pageNumber: number;
  state: 'idle' | 'translating' | 'error' | 'empty';
  error?: string;
  retryAfter?: number;
  onRetry?: (pageNumber: number) => void;
}): React.ReactElement {
  const { cooling, remainingLabel } = useCoolingCountdown(
    state === 'error' ? retryAfter : undefined,
  );
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
            {cooling && (
              <p className="pdf-viewer-layout-status-detail" role="status" aria-live="polite">
                Providers cooling · retry in <strong>{remainingLabel}</strong>
              </p>
            )}
            {onRetry && (
              <button
                type="button"
                onClick={() => onRetry(pageNumber)}
                className="pdf-viewer-retry-button"
                disabled={cooling}
                title={
                  cooling
                    ? `Wait ${remainingLabel} for provider cooldown to end`
                    : 'Retry translation'
                }
              >
                {cooling ? `Retry in ${remainingLabel}` : 'Retry'}
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
  onRetry,
  pdfPage,
  visible,
  dims,
}: PdfTranslationPaneProps): React.ReactElement {
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
          retryAfter={page.retryAfter}
          onRetry={onRetry}
        />
      )}
      {isTranslated && !isEmpty && (
        <LayoutOverlay page={page} pdfPage={pdfPage ?? null} dims={dims} />
      )}
    </div>
  );
}
