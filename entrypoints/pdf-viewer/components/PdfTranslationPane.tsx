/**
 * PdfTranslationPane — Renders the right pane (translated text) for a single
 * page, including loading skeletons, error states, and a retry button.
 */

import type { PageTranslations } from '../lib/pdfTranslation';
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
  /** Current layout mode: 'original' overlay or 'text' flow. */
  layoutMode?: 'original' | 'text';
  /** PDF page proxy for rendering canvas background. */
  pdfPage?: PDFPageProxy | null;
  /** Whether the page is currently visible near the viewport. */
  visible?: boolean;
  /** Pre-computed dimensions for layout overlay. */
  dims?: { width: number; height: number };
}

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

function OriginalLayoutOverlay({
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
  const scale = 720 / baseViewport.width; // 720 is the default maxWidth in PdfCanvasRenderer
  const viewport = pdfPage.getViewport({ scale });

  const originalParagraphs = page.originalParagraphs ?? [];

  return (
    <div
      className="pdf-viewer-overlay-container"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${dims.width}px`,
        height: `${dims.height}px`,
        pointerEvents: 'none',
      }}
    >
      {originalParagraphs.map((para) => {
        const translatedText = page.paragraphs.get(para.id);
        if (!translatedText) return null;

        const [left, top] = viewport.convertToViewportPoint(para.x, para.y);
        const widthCss = para.width * viewport.scale;
        const heightCss = para.height * viewport.scale;

        const originalLen = para.text.length;
        const translatedLen = translatedText.length;
        const isSingleLine = para.height <= para.fontSize * 1.5;

        // Apply a safety margin for font size scaling, particularly on single-line text blocks
        const lengthRatio = translatedLen > 0 ? originalLen / translatedLen : 1;
        const safetyMargin = isSingleLine ? 0.82 : 0.95;
        const scaleFactor = Math.max(0.4, Math.min(1.0, lengthRatio * safetyMargin));
        const originalFontSizeCss = para.fontSize * viewport.scale;
        const computedFontSize = Math.max(7.5, originalFontSizeCss * scaleFactor);

        return (
          <div
            key={para.id}
            className="pdf-viewer-layout-para-box"
            style={{
              position: 'absolute',
              left: `${left}px`,
              top: `${top}px`,
              width: `${widthCss}px`,
              height: `${heightCss}px`,
              fontSize: `${computedFontSize}px`,
              whiteSpace: isSingleLine ? 'nowrap' : 'normal',
            }}
            title={para.text}
          >
            <div style={{ width: '100%', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
              {translatedText}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OriginalLayoutStatusOverlay({
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
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: dims ? `${dims.width}px` : '100%',
        height: dims ? `${dims.height}px` : '100%',
        background: 'rgba(9, 9, 11, 0.5)',
        backdropFilter: 'blur(1.5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          background: '#18181b',
          border: '1px solid #27272a',
          borderRadius: '8px',
          padding: '16px 24px',
          maxWidth: '80%',
          textAlign: 'center',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
        }}
      >
        {state === 'idle' && (
          <p style={{ margin: 0, fontSize: '13px', color: '#a1a1aa' }}>
            Page {pageNumber} — Scroll to translate
          </p>
        )}
        {state === 'translating' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="pdf-viewer-spinner" aria-hidden="true" style={{ margin: 0 }} />
            <span style={{ fontSize: '13px', color: '#e4e4e7' }}>Translating page {pageNumber}...</span>
          </div>
        )}
        {state === 'empty' && (
          <p style={{ margin: 0, fontSize: '13px', color: '#a1a1aa' }}>
            No extractable text on page {pageNumber} (may be a scanned image).
          </p>
        )}
        {state === 'error' && (
          <div>
            <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 'bold', color: '#fca5a5' }}>
              Translation failed
            </p>
            {error && <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#fca5a5' }}>{error}</p>}
            {onRetry && (
              <button
                type="button"
                onClick={() => onRetry(pageNumber)}
                className="pdf-viewer-retry-button"
                style={{ marginTop: 0 }}
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
  layoutMode = 'original',
  pdfPage,
  visible,
  dims,
}: PdfTranslationPaneProps): React.ReactElement {
  if (layoutMode === 'original') {
    const isTranslated = page.state === 'translated';
    const isEmpty = isTranslated && page.paragraphs.size === 0;

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <PdfCanvasRenderer
          page={pdfPage ?? null}
          pageNumber={pageNumber}
          visible={visible ?? false}
          dims={dims}
        />
        {page.state === 'idle' && (
          <OriginalLayoutStatusOverlay pageNumber={pageNumber} state="idle" dims={dims} />
        )}
        {page.state === 'translating' && (
          <OriginalLayoutStatusOverlay pageNumber={pageNumber} state="translating" dims={dims} />
        )}
        {page.state === 'error' && (
          <OriginalLayoutStatusOverlay
            pageNumber={pageNumber}
            state="error"
            error={page.error}
            onRetry={onRetry}
            dims={dims}
          />
        )}
        {isTranslated && isEmpty && (
          <OriginalLayoutStatusOverlay pageNumber={pageNumber} state="empty" dims={dims} />
        )}
        {isTranslated && !isEmpty && (
          <OriginalLayoutOverlay page={page} pdfPage={pdfPage ?? null} dims={dims} />
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
