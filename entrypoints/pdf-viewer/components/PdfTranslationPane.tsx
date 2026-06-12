/**
 * PdfTranslationPane — Renders the right pane (translated text) for a single
 * page, including loading skeletons, error states, and a retry button.
 */

import type { PageTranslations } from '../lib/pdfTranslation';

export interface PdfTranslationPaneProps {
  /** 1-indexed page number this slot corresponds to. */
  pageNumber: number;
  /** Translation state for this page. */
  page: PageTranslations;
  /** Total paragraphs on the page (for skeleton count). */
  paragraphCount: number;
  /** Fired when the user clicks "Retry translation" on an error. */
  onRetry?: (pageNumber: number) => void;
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

export function PdfTranslationPane({
  pageNumber,
  page,
  paragraphCount,
  onRetry,
}: PdfTranslationPaneProps): React.ReactElement {
  if (page.state === 'translating' || page.state === 'idle') {
    return <LoadingSkeleton count={paragraphCount} />;
  }
  if (page.state === 'error') {
    return <ErrorState pageNumber={pageNumber} error={page.error} onRetry={onRetry} />;
  }
  if (paragraphCount === 0) {
    return <EmptyState pageNumber={pageNumber} />;
  }
  return (
    <div className="pdf-viewer-page-translation">
      <TranslatedParagraphs page={page} />
    </div>
  );
}
