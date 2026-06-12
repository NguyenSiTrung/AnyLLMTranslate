/**
 * PDF Viewer — Side-by-side bilingual translation UI.
 *
 * Architecture:
 * 1. `usePdfDocument` — loads the PDF via the bundled worker.
 * 2. `PdfCanvasRenderer` — left pane: renders each page to a canvas.
 * 3. `usePdfPageTranslations` — extracts + translates text on viewport visibility.
 * 4. `PdfTranslationPane` — right pane: shows loading / error / translated text.
 * 5. `useSynchronizedScroll` — mirrors the left pane's scroll on the right.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Loader2, AlertCircle, FileWarning } from 'lucide-react';
import { ViewerLayout } from './components/ViewerLayout';
import { PdfCanvasRenderer } from './components/PdfCanvasRenderer';
import { PdfTranslationPane } from './components/PdfTranslationPane';
import { FilePermissionGuide } from './components/FilePermissionGuide';
import { usePdfDocument } from './hooks/usePdfDocument';
import { usePdfPageTranslations } from './hooks/usePdfPageTranslations';


/** Extract a PDF URL from the `?file=` query parameter */
function getPdfUrlFromQuery(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('file');
  } catch {
    return null;
  }
}

/** Whether the given URL points at a local `file://` resource. */
function isFileScheme(url: string): boolean {
  try {
    return new URL(url).protocol === 'file:';
  } catch {
    return false;
  }
}

export default function App(): ReactElement {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const rightContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPdfUrl(getPdfUrlFromQuery());
  }, []);

  const { loadState, pages, bytesLoaded, bytesTotal, error } = usePdfDocument(pdfUrl);
  const { pages: translations, translatedCount, totalCount, retryPage } = usePdfPageTranslations({
    pages,
    pdfUrl: pdfUrl ?? '',
    containerRef: rightContainerRef,
  });



  const isFile = pdfUrl ? isFileScheme(pdfUrl) : false;
  const fileName = pdfUrl ? (() => {
    try {
      const u = new URL(pdfUrl);
      return u.pathname.split('/').pop() || u.hostname || 'document.pdf';
    } catch {
      return 'document.pdf';
    }
  })() : 'document.pdf';

  // Fully-loaded state: render the bilingual viewer directly
  if (loadState === 'loaded' && pdfUrl) {
    const leftPane = (
      <>
        {pages.map((page, idx) => (
          <PdfCanvasRenderer key={`canvas-${idx + 1}`} page={page} pageNumber={idx + 1} />
        ))}
      </>
    );
    const rightPane = (
      <>
        {pages.map((_, idx) => {
          const pageNumber = idx + 1;
          const translation = translations.get(pageNumber) ?? { paragraphs: new Map(), state: 'idle' as const };
          const count = 0;
          return (
            <div key={`translation-${pageNumber}`} data-page-slot={pageNumber}>
              <PdfTranslationPane
                pageNumber={pageNumber}
                page={translation}
                paragraphCount={count}
                onRetry={retryPage}
              />
            </div>
          );
        })}
      </>
    );
    return (
      <ViewerLayout
        title="PDF Translator"
        subtitle={fileName}
        banner={<FilePermissionGuide visible={isFile} />}
        left={leftPane}
        right={
          <div ref={rightContainerRef} style={{ padding: '16px' }}>
            <div className="pdf-viewer-progress-pill">
              {translatedCount} / {totalCount} pages translated
            </div>
            {rightPane}
          </div>
        }
      />
    );
  }

  // Non-loaded states render in a single centered column
  const body: ReactElement = (() => {
    if (!pdfUrl) {
      return (
        <div className="pdf-viewer-empty-state">
          <FileWarning size={36} />
          <h2>No PDF URL provided</h2>
          <p>
            Open this page with a <code>?file=&lt;url&gt;</code> query parameter, e.g.{' '}
            <code>pdf-viewer.html?file=https://example.com/sample.pdf</code>.
          </p>
        </div>
      );
    }
    if (loadState === 'loading') {
      const percent = bytesTotal > 0 ? Math.round((bytesLoaded / bytesTotal) * 100) : null;
      return (
        <div className="pdf-viewer-empty-state">
          <Loader2 size={36} className="pdf-viewer-spin-large" />
          <h2>Loading PDF...</h2>
          {percent !== null ? (
            <p>
              {Math.round(bytesLoaded / 1024)} KB / {Math.round(bytesTotal / 1024)} KB ({percent}%)
            </p>
          ) : (
            <p>Connecting to {fileName}...</p>
          )}
        </div>
      );
    }
    // loadState === 'error'
    return (
      <div className="pdf-viewer-empty-state pdf-viewer-empty-state--error">
        <AlertCircle size={36} />
        <h2>Failed to load PDF</h2>
        <p>{error ?? 'Unknown error'}</p>
        {isFile && (
          <p className="pdf-viewer-empty-state-hint">
            For local files, make sure you enabled &quot;Allow access to file URLs&quot; in the extension settings.
          </p>
        )}
      </div>
    );
  })();

  return (
    <div className="pdf-viewer-root">
      <header className="pdf-viewer-header">
        <h1>PDF Translator</h1>
        {pdfUrl && <p className="pdf-viewer-subtitle">{fileName}</p>}
      </header>
      <main className="pdf-viewer-main pdf-viewer-main--single">
        {body}
      </main>
    </div>
  );
}
