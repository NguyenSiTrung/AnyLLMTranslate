/**
 * PDF Viewer — Side-by-side bilingual translation UI.
 *
 * Architecture:
 * 1. `usePdfDocument` — loads the PDF via the bundled worker.
 * 2. `useVisiblePages` — tracks which pages are in the viewport (+buffer).
 * 3. `PdfCanvasRenderer` — left pane: renders only visible pages to canvas.
 * 4. `usePdfPageTranslations` — extracts + translates text on viewport visibility.
 * 5. `PdfTranslationPane` — right pane: shows loading / error / translated text.
 * 6. `useSynchronizedScroll` — mirrors the left pane's scroll on the right.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Loader2, AlertCircle, FileWarning } from 'lucide-react';
import type { PdfViewMode } from '@/lib/constants';
import { loadPdfViewMode, savePdfViewMode } from './lib/pdfViewMode';
import { ViewerLayout } from './components/ViewerLayout';
import { PdfCanvasRenderer } from './components/PdfCanvasRenderer';
import { PdfTranslationPane } from './components/PdfTranslationPane';
import { FilePermissionGuide } from './components/FilePermissionGuide';
import { usePdfDocument } from './hooks/usePdfDocument';
import { usePdfPageTranslations } from './hooks/usePdfPageTranslations';
import { useVisiblePages } from './hooks/useVisiblePages';


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
  const [layoutMode, setLayoutMode] = useState<'original' | 'text'>('original');
  const [viewMode, setViewMode] = useState<PdfViewMode>('split');
  const rightContainerRef = useRef<HTMLDivElement | null>(null);
  const leftContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPdfUrl(getPdfUrlFromQuery());
  }, []);

  useEffect(() => {
    void loadPdfViewMode().then((mode) => setViewMode(mode));
  }, []);

  const handleViewModeChange = (mode: PdfViewMode): void => {
    setViewMode(mode);
    void savePdfViewMode(mode);
  };

  const { loadState, pages, numPages, bytesLoaded, bytesTotal, error } = usePdfDocument(pdfUrl);

  // Filter to non-null pages for the translation hook (which needs actual PDFPageProxy)
  const loadedPages = useMemo(
    () => pages.filter((p): p is NonNullable<typeof p> => p !== null),
    [pages],
  );

  const { pages: translations, translatedCount, totalCount, retryPage } = usePdfPageTranslations({
    pages: loadedPages,
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

  // Canvas virtualization: only mount PdfCanvasRenderer for pages near viewport
  // In translation-only mode there is no left pane; observe the right pane so
  // overlay canvases (Layout sub-mode) still mount/unmount near the viewport.
  const visibilityContainerRef = viewMode === 'translation-only' ? rightContainerRef : leftContainerRef;
  const { visiblePages } = useVisiblePages({
    totalPages: numPages,
    containerRef: visibilityContainerRef,
  });

  // Pre-compute page dimensions for placeholder sizing (cheap — no text extraction)
  const pageDimensions = useMemo(() => {
    const dims = new Map<number, { width: number; height: number }>();
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (!page) continue; // Skip pages not yet fetched
      const viewport = page.getViewport({ scale: 1 });
      // Scale to fit 720px width (matching PdfCanvasRenderer default)
      const scale = 720 / viewport.width;
      dims.set(i + 1, {
        width: Math.floor(viewport.width * scale),
        height: Math.floor(viewport.height * scale),
      });
    }
    return dims;
  }, [pages]);

  // Fully-loaded state: render the bilingual viewer directly
  if (loadState === 'loaded' && pdfUrl) {
    const leftPane = viewMode === 'translation-only' ? null : (
      <>
        {Array.from({ length: numPages }, (_, idx) => {
          const pageNumber = idx + 1;
          const page = pages[idx] ?? null;
          const dims = pageDimensions.get(pageNumber);
          const isVisible = visiblePages.has(pageNumber);
          return (
            <PdfCanvasRenderer
              key={`page-${pageNumber}`}
              page={page}
              pageNumber={pageNumber}
              visible={isVisible}
              dims={dims}
            />
          );
        })}
      </>
    );
    const rightPane = (
      <>
        {Array.from({ length: numPages }, (_, idx) => {
          const pageNumber = idx + 1;
          const translation = translations.get(pageNumber) ?? { paragraphs: new Map(), state: 'idle' as const };
          const dims = pageDimensions.get(pageNumber);
          const widthStyle = dims ? `${dims.width}px` : '720px';
          const page = pages[idx] ?? null;
          const isVisible = visiblePages.has(pageNumber);
          return (
            <div
              key={`translation-${pageNumber}`}
              data-page-slot={pageNumber}
              className="pdf-viewer-page"
              style={{ width: widthStyle }}
            >
              <PdfTranslationPane
                pageNumber={pageNumber}
                page={translation}
                paragraphCount={0}
                onRetry={retryPage}
                layoutMode={layoutMode}
                pdfPage={page}
                visible={isVisible}
                dims={dims}
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
        viewMode={viewMode}
        banner={<FilePermissionGuide visible={isFile} />}
        left={leftPane}
        leftPaneRef={leftContainerRef}
        right={
          <div ref={rightContainerRef}>
            {rightPane}
          </div>
        }
        headerExtra={
          <div className="pdf-viewer-header-controls">
            <div className="pdf-viewer-toggle-group" role="group" aria-label="PDF view mode (split vs translation only)">
              <button
                type="button"
                className={`pdf-viewer-toggle-btn ${viewMode === 'split' ? 'pdf-viewer-toggle-btn--active' : ''}`}
                onClick={() => handleViewModeChange('split')}
                aria-pressed={viewMode === 'split'}
                title="Split: show the original PDF on the left and the translation on the right, scroll-synced."
              >
                Split
              </button>
              <button
                type="button"
                className={`pdf-viewer-toggle-btn ${viewMode === 'translation-only' ? 'pdf-viewer-toggle-btn--active' : ''}`}
                onClick={() => handleViewModeChange('translation-only')}
                aria-pressed={viewMode === 'translation-only'}
                title="Translation only: hide the original PDF pane and show the translation full-width."
              >
                Translation
              </button>
            </div>
            <div className="pdf-viewer-toggle-group" role="group" aria-label="Translation layout mode">
              <button
                type="button"
                className={`pdf-viewer-toggle-btn ${layoutMode === 'original' ? 'pdf-viewer-toggle-btn--active' : ''}`}
                onClick={() => setLayoutMode('original')}
                aria-pressed={layoutMode === 'original'}
                title="Layout (visual reference): translated text keeps the original page's horizontal structure and reading order, reflowing vertically. Best for matching translated text to the original layout."
              >
                Layout
              </button>
              <button
                type="button"
                className={`pdf-viewer-toggle-btn ${layoutMode === 'text' ? 'pdf-viewer-toggle-btn--active' : ''}`}
                onClick={() => setLayoutMode('text')}
                aria-pressed={layoutMode === 'text'}
                title="Text (recommended): translated text flows as plain paragraphs. Best for reading."
              >
                Text
              </button>
            </div>
            <div className="pdf-viewer-progress-pill">
              {translatedCount} / {totalCount} pages translated
            </div>
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
        <div className="pdf-viewer-header-left">
          <h1>PDF Translator</h1>
          {pdfUrl && <p className="pdf-viewer-subtitle">{fileName}</p>}
        </div>
      </header>
      <main className="pdf-viewer-main pdf-viewer-main--single">
        {body}
      </main>
    </div>
  );
}
