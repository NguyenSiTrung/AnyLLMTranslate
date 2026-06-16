/**
 * PdfTranslationPane — Renders the right pane (translated text) for a single
 * page, including loading skeletons, error states, and a retry button.
 *
 * Layout modes:
 * - 'text' (default): translated paragraphs in a simple vertical reading flow.
 * - 'original' (elastic overlay): translated paragraphs preserve their original
 *   horizontal position/width and reading order, but grow to natural height
 *   (no clipping, micro-fonts, or popovers).
 */

import type { PageTranslations } from '../lib/pdfTranslation';
import type { PdfParagraph } from '../lib/pdfTextExtraction';
import type { PDFPageProxy } from 'pdfjs-dist';

export interface PdfTranslationPaneProps {
  /** 1-indexed page number this slot corresponds to. */
  pageNumber: number;
  /** Translation state for this page. */
  page: PageTranslations;
  /** Total paragraphs on the page (for skeleton count). */
  paragraphCount: number;
  /** Fired when the user clicks "Retry translation" on an error. */
  onRetry?: (pageNumber: number) => void;
  /** Current layout mode: 'original' elastic overlay (visual reference) or 'text' flow (default reading). */
  layoutMode?: 'original' | 'text';
  /** PDF page proxy for computing elastic paragraph geometry. */
  pdfPage?: PDFPageProxy | null;
  /** Whether the page is currently visible near the viewport. */
  visible?: boolean;
  /** Pre-computed dimensions for layout overlay. */
  dims?: { width: number; height: number };
}

/** Minimum readable font size (px) for elastic overlay text. */
const MIN_FONT_SIZE_PX = 12;
/** Maximum font size (px) cap so headings don't become absurdly large. */
const MAX_FONT_SIZE_PX = 32;
/** Minimum width (px) for an elastic paragraph box. */
const MIN_PARA_WIDTH_PX = 80;

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

/**
 * Elastic paragraph box — preserves the original horizontal position and width
 * but grows to natural height. Rendered in normal document flow so subsequent
 * paragraphs push down instead of overlapping.
 */
function ElasticParagraph({
  para,
  translatedText,
  scale,
  pageWidth,
}: {
  para: PdfParagraph;
  translatedText: string;
  scale: number;
  pageWidth: number;
}): React.ReactElement {
  const leftCss = para.x * scale;
  // Constrain the width so it never overflows the page slot, while keeping a
  // readable minimum so very narrow source boxes don't squeeze the text.
  const maxAvail = Math.max(MIN_PARA_WIDTH_PX, pageWidth - leftCss - 8);
  const widthCss = Math.min(Math.max(para.width * scale, MIN_PARA_WIDTH_PX), maxAvail);
  const fontSizeCss = Math.min(
    Math.max(para.fontSize * scale, MIN_FONT_SIZE_PX),
    MAX_FONT_SIZE_PX,
  );

  return (
    <div
      className={`pdf-viewer-elastic-para${para.isHeading ? ' pdf-viewer-elastic-para--heading' : ''}`}
      style={{
        marginLeft: `${leftCss}px`,
        width: `${widthCss}px`,
        fontSize: `${fontSizeCss}px`,
      }}
    >
      {translatedText}
    </div>
  );
}

/**
 * Elastic overlay page — a white "page" sized to the original page width that
 * stacks translated paragraph boxes vertically. Masks the original page area
 * with an opaque white background and renders dark, readable text.
 */
function ElasticLayoutPane({
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
  // 720 is the default maxWidth used by PdfCanvasRenderer (left pane).
  const scale = 720 / baseViewport.width;
  const originalParagraphs = page.originalParagraphs ?? [];

  return (
    <div className="pdf-viewer-elastic-page" style={{ width: `${dims.width}px` }}>
      {originalParagraphs.map((para) => {
        const translatedText = page.paragraphs.get(para.id);
        if (!translatedText) return null;
        return (
          <ElasticParagraph
            key={para.id}
            para={para}
            translatedText={translatedText}
            scale={scale}
            pageWidth={dims.width}
          />
        );
      })}
    </div>
  );
}

/** Centered status box for non-translated elastic states (idle/loading/error/empty). */
function ElasticStatusOverlay({
  pageNumber,
  state,
  error,
  onRetry,
  dims,
}: {
  pageNumber: number;
  state: 'idle' | 'translating' | 'error' | 'empty';
  error?: string;
  onRetry?: (pageNumber: number) => void;
  dims?: { width: number; height: number };
}): React.ReactElement {
  return (
    <div
      className="pdf-viewer-elastic-status"
      style={{ minHeight: dims ? `${dims.height}px` : 'auto' }}
    >
      <div className="pdf-viewer-elastic-status-card">
        {state === 'idle' && (
          <p>Page {pageNumber} — Scroll to translate</p>
        )}
        {state === 'translating' && (
          <div className="pdf-viewer-elastic-status-row">
            <span className="pdf-viewer-spinner" aria-hidden="true" />
            <span>Translating page {pageNumber}...</span>
          </div>
        )}
        {state === 'empty' && (
          <p>No extractable text on page {pageNumber} (may be a scanned image).</p>
        )}
        {state === 'error' && (
          <div>
            <p className="pdf-viewer-elastic-status-error">Translation failed</p>
            {error && <p className="pdf-viewer-elastic-status-detail">{error}</p>}
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
  dims,
}: PdfTranslationPaneProps): React.ReactElement {
  if (layoutMode === 'original') {
    const isTranslated = page.state === 'translated';
    const isEmpty = isTranslated && page.paragraphs.size === 0;

    if (!isTranslated || isEmpty) {
      const status: 'idle' | 'translating' | 'error' | 'empty' =
        page.state === 'error'
          ? 'error'
          : page.state === 'translating'
            ? 'translating'
            : isEmpty
              ? 'empty'
              : 'idle';
      return (
        <ElasticStatusOverlay
          pageNumber={pageNumber}
          state={status}
          error={page.error}
          onRetry={onRetry}
          dims={dims}
        />
      );
    }

    return <ElasticLayoutPane page={page} pdfPage={pdfPage ?? null} dims={dims} />;
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
