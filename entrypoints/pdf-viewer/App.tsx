/**
 * PDF Viewer — full-width reader with optional original|result compare.
 *
 * PDF translation runs only via the local Scientific Docker bridge (pdf2zh).
 * Idle shell is a single-column reader; split exists only to compare source
 * vs an adopted bridge result. Bridge health is header chrome + offline setup card.
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { FileWarning, FlaskConical, Settings2 } from 'lucide-react';
import { ViewerLayout } from './components/ViewerLayout';
import { PdfDocumentPane } from './components/PdfDocumentPane';
import { FilePermissionGuide } from './components/FilePermissionGuide';
import { BridgeSetupCard } from './components/BridgeSetupCard';
import { useScientificPdfJob } from './hooks/useScientificPdfJob';
import { ScientificJobModal } from './components/ScientificJobModal';
import { compareArtifactKind } from './components/scientificJobModalFormats';
import {
  applyOpenCompare,
  applyOpenTranslated,
  applyShellMode,
  compareRightLabel,
  initialSessionState,
  readerPaneLabel,
  type ResultArtifactKind,
} from './lib/pdfShellMode';

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
  const [sourcePdfUrl, setSourcePdfUrl] = useState<string | null>(null);
  const [resultPdfUrl, setResultPdfUrl] = useState<string | null>(null);
  const [session, setSession] = useState(initialSessionState);
  const [showScientificModal, setShowScientificModal] = useState(false);
  const [setupCardDismissed, setSetupCardDismissed] = useState(false);
  const [sourceNumPages, setSourceNumPages] = useState(0);

  const readerScrollRef = useRef<HTMLDivElement | null>(null);
  const compareLeftRef = useRef<HTMLDivElement | null>(null);
  const compareRightRef = useRef<HTMLDivElement | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setSourcePdfUrl(getPdfUrlFromQuery());
  }, []);

  useEffect(() => {
    return () => {
      if (resultUrlRef.current) {
        URL.revokeObjectURL(resultUrlRef.current);
        resultUrlRef.current = null;
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

  const isFile = sourcePdfUrl ? isFileScheme(sourcePdfUrl) : false;

  const scientific = useScientificPdfJob({
    pdfUrl: sourcePdfUrl ?? '',
    fileName,
  });

  // Probe bridge health on open so Ready / Unavailable is accurate.
  // Intentional once-per-source: only re-run when the PDF URL changes (not on
  // every scientific object identity change). react-hooks/exhaustive-deps is not
  // registered in this project's ESLint config — do not disable unknown rules.
  useEffect(() => {
    if (!sourcePdfUrl) return;
    void scientific.refreshHealth();
  }, [sourcePdfUrl]);

  const bridgeReady = scientific.healthOk === true;
  const bridgeStatusLabel = bridgeReady
    ? 'Bridge ready'
    : scientific.healthOk === null
      ? 'Checking bridge…'
      : scientific.bridgeStatus === 'not_configured'
        ? 'Not configured'
        : 'Bridge offline';

  function adoptResultBlob(
    blob: Blob,
    kind: ResultArtifactKind,
    next: 'translated' | 'compare',
  ): void {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
    }
    const url = URL.createObjectURL(blob);
    resultUrlRef.current = url;
    setResultPdfUrl(url);
    setSession((s) =>
      next === 'compare' ? applyOpenCompare(s, kind) : applyOpenTranslated(s, kind),
    );
  }

  // Translate opens the modal's setup stage (page selection) — the job
  // starts from the modal's Start button.
  const startTranslate = (): void => {
    if (!bridgeReady) {
      setSetupCardDismissed(false);
      return;
    }
    setShowScientificModal(true);
  };

  const handleSourceNumPages = useCallback((n: number): void => {
    setSourceNumPages(n);
  }, []);

  const shellMode =
    session.shellMode === 'compare' && resultPdfUrl ? 'compare' : 'reader';

  const readerUrl =
    session.readerFocus === 'result' && resultPdfUrl ? resultPdfUrl : sourcePdfUrl;

  const showSetupOverlay =
    scientific.healthOk === false && !setupCardDismissed && !scientific.isRunning;

  const headerExtra = (
    <div className="pdf-viewer-header-controls">
      {resultPdfUrl && (
        <div className="pdf-viewer-mode-toggle" role="radiogroup" aria-label="View mode">
          <button
            type="button"
            role="radio"
            aria-checked={shellMode === 'reader'}
            className={`pdf-viewer-mode-btn${shellMode === 'reader' ? ' pdf-viewer-mode-btn--active' : ''}`}
            onClick={() => setSession((s) => applyShellMode(s, 'reader'))}
          >
            Reader
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={shellMode === 'compare'}
            className={`pdf-viewer-mode-btn${shellMode === 'compare' ? ' pdf-viewer-mode-btn--active' : ''}`}
            onClick={() => setSession((s) => applyShellMode(s, 'compare'))}
          >
            Compare
          </button>
        </div>
      )}
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
          disabled={scientific.isRunning || !sourcePdfUrl}
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
          disabled={scientific.healthOk === null}
          title="PDF Translate requires the Docker bridge — open setup"
        >
          <Settings2 size={14} />
          Set up bridge
        </button>
      )}
    </div>
  );

  const banner = (
    <>
      <FilePermissionGuide visible={isFile} />
      {!bridgeReady && scientific.healthOk !== null && (
        <div className="pdf-viewer-scan-banner" role="status">
          PDF Translate needs the Docker bridge.{' '}
          <button type="button" className="pdf-viewer-banner-link" onClick={openOptionsPage}>
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
      {shellMode === 'reader' && session.readerFocus === 'result' && resultPdfUrl && (
        <div className="pdf-viewer-scan-banner pdf-viewer-scan-banner--info" role="status">
          Viewing translated result.{' '}
          <button
            type="button"
            className="pdf-viewer-banner-link"
            onClick={() =>
              setSession((s) => ({ ...s, readerFocus: 'source', shellMode: 'reader' }))
            }
          >
            Show original
          </button>
          {' · '}
          <button
            type="button"
            className="pdf-viewer-banner-link"
            onClick={() => setSession((s) => applyShellMode(s, 'compare'))}
          >
            Compare side-by-side
          </button>
        </div>
      )}
    </>
  );

  const showModal =
    showScientificModal ||
    scientific.isRunning ||
    scientific.progress.stage === 'done' ||
    scientific.progress.stage === 'error';

  if (sourcePdfUrl) {
    return (
      <>
        <ViewerLayout
          title="PDF Translator"
          subtitle={fileName}
          mode={shellMode}
          banner={banner}
          headerExtra={headerExtra}
          readerLabel={readerPaneLabel(session.readerFocus, session.resultKind)}
          readerPaneRef={readerScrollRef}
          reader={
            <PdfDocumentPane
              url={readerUrl}
              containerRef={readerScrollRef}
              onNumPages={readerUrl === sourcePdfUrl ? handleSourceNumPages : undefined}
            />
          }
          leftPaneRef={compareLeftRef}
          rightPaneRef={compareRightRef}
          leftLabel="Original"
          rightLabel={compareRightLabel(session.resultKind)}
          left={
            <PdfDocumentPane
              url={sourcePdfUrl}
              containerRef={compareLeftRef}
              onNumPages={handleSourceNumPages}
            />
          }
          right={
            resultPdfUrl ? (
              <PdfDocumentPane url={resultPdfUrl} containerRef={compareRightRef} />
            ) : null
          }
          mainOverlay={
            showSetupOverlay ? (
              <div className="pdf-bridge-setup-overlay">
                <BridgeSetupCard
                  variant="overlay"
                  status={scientific.bridgeStatus}
                  onRefresh={() => void scientific.refreshHealth()}
                  onOpenSetup={openOptionsPage}
                  onDismiss={() => setSetupCardDismissed(true)}
                />
              </div>
            ) : null
          }
        />
        {showModal && (
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
            fileName={fileName}
            numPages={sourceNumPages}
            hasPreviousRun={scientific.hasPreviousRun}
            onStart={(pages, opts) => {
              void scientific.startJob(
                pages || opts?.mergeWithPrevious !== undefined
                  ? {
                      ...(pages ? { pages } : {}),
                      ...(opts?.mergeWithPrevious !== undefined
                        ? { mergeWithPrevious: opts.mergeWithPrevious }
                        : {}),
                    }
                  : {},
              );
            }}
            onCancel={() => void scientific.cancel()}
            onClose={() => {
              setShowScientificModal(false);
              scientific.dismissProgress();
            }}
            onRetry={() => {
              // Back to the setup stage so the page selection can be adjusted.
              scientific.dismissProgress();
              setShowScientificModal(true);
            }}
            onOpenTranslated={() => {
              const prefer = scientific.progress.hasMono
                ? 'mono'
                : scientific.progress.hasDual
                  ? 'dual'
                  : null;
              if (!prefer) return;
              const blob = scientific.resolveResultBlob(prefer);
              if (!blob) return;
              adoptResultBlob(blob, prefer, 'translated');
              setShowScientificModal(false);
              scientific.dismissProgress();
            }}
            onOpenCompare={
              sourcePdfUrl
                ? () => {
                    const prefer = compareArtifactKind({
                      hasMono: scientific.progress.hasMono,
                      hasDual: scientific.progress.hasDual,
                    });
                    if (!prefer) return;
                    const blob = scientific.resolveResultBlob(prefer);
                    if (!blob) return;
                    adoptResultBlob(blob, prefer, 'compare');
                    setShowScientificModal(false);
                    scientific.dismissProgress();
                  }
                : undefined
            }
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

  // No source URL — centered empty shell
  return (
    <div className="pdf-viewer-root">
      <header className="pdf-viewer-header">
        <div className="pdf-viewer-header-left">
          <h1>PDF Translator</h1>
        </div>
        {headerExtra}
      </header>
      <main className="pdf-viewer-main pdf-viewer-main--single">
        <div className="pdf-viewer-empty-state">
          <FileWarning size={36} />
          <h2>No PDF URL provided</h2>
          <p>
            Open this page with a <code>?file=&lt;url&gt;</code> query parameter, e.g.{' '}
            <code>pdf-viewer.html?file=https://example.com/sample.pdf</code>.
          </p>
        </div>
      </main>
    </div>
  );
}
