/**
 * PDF Viewer — side-by-side original PDF + Docker-bridge translation.
 *
 * PDF translation runs only via the local Scientific Docker bridge (pdf2zh).
 * The legacy in-browser Fast translate path is no longer offered: when the
 * bridge is offline or not configured, translate controls show as unavailable
 * and guide the user to set up / connect the bridge.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Loader2, AlertCircle, FileWarning, FlaskConical, Settings2 } from 'lucide-react';
import { ViewerLayout } from './components/ViewerLayout';
import { PdfCanvasRenderer } from './components/PdfCanvasRenderer';
import { FilePermissionGuide } from './components/FilePermissionGuide';
import { BridgeStatusPanel } from './components/BridgeStatusPanel';
import { usePdfDocument } from './hooks/usePdfDocument';
import { useVisiblePages } from './hooks/useVisiblePages';
import { useScientificPdfJob } from './hooks/useScientificPdfJob';
import { ScientificJobModal } from './components/ScientificJobModal';

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

function openOptionsPage(): void {
  try {
    void chrome.runtime.openOptionsPage();
  } catch {
    window.open(chrome.runtime.getURL('options.html'), '_blank');
  }
}

export default function App(): ReactElement {
  /** Currently displayed PDF (original or a scientific result). */
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  /**
   * Original source PDF used for Translate jobs. Kept separate so opening a
   * result does not make the next job re-translate the already-translated PDF,
   * and so job reset can revoke result blob URLs without breaking the source.
   */
  const [sourcePdfUrl, setSourcePdfUrl] = useState<string | null>(null);
  const [showScientificModal, setShowScientificModal] = useState(false);
  const [viewingResult, setViewingResult] = useState(false);
  const leftContainerRef = useRef<HTMLDivElement | null>(null);
  /** Object URLs created when adopting a scientific result into this tab. */
  const adoptedResultUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const initial = getPdfUrlFromQuery();
    setPdfUrl(initial);
    setSourcePdfUrl(initial);
  }, []);

  // Revoke App-owned result object URLs on unmount.
  useEffect(() => {
    return () => {
      if (adoptedResultUrlRef.current) {
        URL.revokeObjectURL(adoptedResultUrlRef.current);
        adoptedResultUrlRef.current = null;
      }
    };
  }, []);

  // Keep the background SW alive while the viewer tab is open.
  useEffect(() => {
    void chrome.runtime.sendMessage({ action: 'REGISTER_PDF_SESSION' }).catch(() => {
      /* best-effort: SW may be asleep on first call */
    });
    return () => {
      void chrome.runtime.sendMessage({ action: 'UNREGISTER_PDF_SESSION' }).catch(() => {
        /* best-effort */
      });
    };
  }, []);

  const numPagesRef = useRef(0);
  const { visiblePages } = useVisiblePages({
    totalPages: numPagesRef.current,
    containerRef: leftContainerRef,
  });

  const { loadState, pages, numPages, bytesLoaded, bytesTotal, error } = usePdfDocument(pdfUrl, {
    visiblePages,
  });
  numPagesRef.current = numPages;

  const isFile = sourcePdfUrl ? isFileScheme(sourcePdfUrl) : false;
  const fileName = sourcePdfUrl
    ? (() => {
        try {
          const u = new URL(sourcePdfUrl);
          return u.pathname.split('/').pop() || u.hostname || 'document.pdf';
        } catch {
          return 'document.pdf';
        }
      })()
    : 'document.pdf';

  const scientific = useScientificPdfJob({
    pdfUrl: sourcePdfUrl ?? '',
    fileName,
  });

  // Probe bridge health on open so Ready / Unavailable is accurate.
  useEffect(() => {
    if (!sourcePdfUrl) return;
    void scientific.refreshHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per source document
  }, [sourcePdfUrl]);

  const bridgeReady = scientific.healthOk === true;
  const bridgeStatusLabel = bridgeReady
    ? 'Bridge ready'
    : scientific.healthOk === null
      ? 'Checking bridge…'
      : scientific.bridgeStatus === 'not_configured'
        ? 'Not configured'
        : 'Bridge offline';

  const pageDimensions = useMemo(() => {
    const dims = new Map<number, { width: number; height: number }>();
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (!page) continue;
      const viewport = page.getViewport({ scale: 1 });
      const scale = 720 / viewport.width;
      dims.set(i + 1, {
        width: Math.floor(viewport.width * scale),
        height: Math.floor(viewport.height * scale),
      });
    }
    return dims;
  }, [pages]);

  const startTranslate = (): void => {
    if (!bridgeReady) {
      setShowScientificModal(true);
      return;
    }
    setShowScientificModal(true);
    void scientific.startJob();
  };

  if (loadState === 'loaded' && pdfUrl) {
    const leftPane = (
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
      <BridgeStatusPanel
        status={scientific.bridgeStatus}
        healthOk={scientific.healthOk}
        isRunning={scientific.isRunning}
        onRefresh={() => void scientific.refreshHealth()}
        onOpenSetup={openOptionsPage}
        onTranslate={startTranslate}
      />
    );

    return (
      <>
        <ViewerLayout
          title="PDF Translator"
          subtitle={fileName}
          viewMode="split"
          banner={
            <>
              <FilePermissionGuide visible={isFile} />
              {viewingResult && sourcePdfUrl && (
                <div className="pdf-viewer-scan-banner pdf-viewer-scan-banner--info" role="status">
                  Showing translated result from the Docker bridge.{' '}
                  <button
                    type="button"
                    className="pdf-viewer-banner-link"
                    onClick={() => {
                      if (adoptedResultUrlRef.current) {
                        URL.revokeObjectURL(adoptedResultUrlRef.current);
                        adoptedResultUrlRef.current = null;
                      }
                      setPdfUrl(sourcePdfUrl);
                      setViewingResult(false);
                    }}
                  >
                    Back to original
                  </button>
                </div>
              )}
              {!bridgeReady && scientific.healthOk !== null && (
                <div className="pdf-viewer-scan-banner" role="status">
                  PDF Translate is not available until the Docker bridge is connected.{' '}
                  <button
                    type="button"
                    className="pdf-viewer-banner-link"
                    onClick={openOptionsPage}
                  >
                    Set up bridge
                  </button>
                  {' · '}
                  <button
                    type="button"
                    className="pdf-viewer-banner-link"
                    onClick={() => void scientific.refreshHealth()}
                  >
                    Check connection
                  </button>
                </div>
              )}
            </>
          }
          left={leftPane}
          leftPaneRef={leftContainerRef}
          right={rightPane}
          headerExtra={
            <div className="pdf-viewer-header-controls">
              <div
                className={`pdf-viewer-progress-pill${
                  bridgeReady
                    ? ' pdf-viewer-progress-pill--ok'
                    : scientific.healthOk === false
                      ? ' pdf-viewer-progress-pill--warn'
                      : ''
                }`}
                title="Local Docker bridge status for PDF translation"
              >
                {bridgeStatusLabel}
              </div>
              {bridgeReady ? (
                <button
                  type="button"
                  className="pdf-download-btn-header"
                  onClick={startTranslate}
                  disabled={scientific.isRunning || !pdfUrl}
                  title="Run layout-preserving translation via local Docker bridge"
                >
                  <FlaskConical size={14} />
                  Translate
                </button>
              ) : (
                <button
                  type="button"
                  className="pdf-download-btn-header pdf-download-btn-header--muted"
                  onClick={openOptionsPage}
                  title="PDF Translate requires the Docker bridge — open setup"
                >
                  <Settings2 size={14} />
                  Set up bridge
                </button>
              )}
            </div>
          }
        />
        {(showScientificModal ||
          scientific.isRunning ||
          scientific.progress.stage === 'done' ||
          scientific.progress.stage === 'error') && (
          <ScientificJobModal
            progress={
              !bridgeReady &&
              scientific.progress.stage === 'idle' &&
              showScientificModal
                ? {
                    ...scientific.progress,
                    stage: 'error',
                    error:
                      'PDF Translate is not available. Connect the local Docker bridge first.',
                    errorCode: 'offline',
                    message: 'Bridge not ready',
                  }
                : scientific.progress
            }
            onCancel={() => void scientific.cancel()}
            onClose={() => {
              setShowScientificModal(false);
              // Soft dismiss: keep mono/dual blob URLs alive so a previously
              // adopted "Open in viewer" result (or a re-open) still works.
              // Full revoke happens on the next startJob() via reset().
              scientific.dismissProgress();
            }}
            onRetry={() => {
              setShowScientificModal(true);
              void scientific.startJob();
            }}
            onOpenResult={(prefer) => {
              // Load the result into *this* viewer. Opening a new tab with
              // ?file=blob:… is unreliable (blank page). Own a fresh object URL
              // so job reset() can revoke the hook's URLs without blanking us.
              const blob = scientific.resolveResultBlob(prefer);
              if (!blob) return;
              if (adoptedResultUrlRef.current) {
                URL.revokeObjectURL(adoptedResultUrlRef.current);
              }
              const localUrl = URL.createObjectURL(blob);
              adoptedResultUrlRef.current = localUrl;
              setPdfUrl(localUrl);
              setViewingResult(true);
              setShowScientificModal(false);
              scientific.dismissProgress();
            }}
            onDownloadMono={() => scientific.downloadMono()}
            onDownloadDual={() => scientific.downloadDual()}
            onDownloadSideBySide={() => void scientific.downloadSideBySide()}
            onOpenSetup={() => {
              setShowScientificModal(false);
              openOptionsPage();
            }}
          />
        )}
      </>
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
    return (
      <div className="pdf-viewer-empty-state pdf-viewer-empty-state--error">
        <AlertCircle size={36} />
        <h2>Failed to load PDF</h2>
        <p>{error ?? 'Unknown error'}</p>
        {isFile && (
          <p className="pdf-viewer-empty-state-hint">
            For local files, make sure you enabled &quot;Allow access to file URLs&quot; in the
            extension settings.
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
      <main className="pdf-viewer-main pdf-viewer-main--single">{body}</main>
    </div>
  );
}
