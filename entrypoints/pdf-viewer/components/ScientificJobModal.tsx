/**
 * Progress / result modal for Scientific PDF bridge jobs.
 * Shows staged progress, live activity log, and explicit download choices
 * (mono / pdf2zh dual / side-by-side) — no auto-download.
 */

import { useEffect, useRef, type ReactElement } from 'react';
import {
  SCIENTIFIC_STAGE_META,
  type ScientificJobProgress,
  type ScientificJobStage,
} from '../hooks/useScientificPdfJob';

export interface ScientificJobModalProps {
  progress: ScientificJobProgress;
  onCancel: () => void;
  onClose: () => void;
  onRetry: () => void;
  onOpenResult: (prefer?: 'dual' | 'mono') => void;
  onOpenSetup?: () => void;
  onDownloadMono?: () => void;
  onDownloadDual?: () => void;
  onDownloadSideBySide?: () => void;
}

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

const PIPELINE_STEPS: ScientificJobStage[] = [
  'checking',
  'uploading',
  'running',
  'downloading',
  'done',
];

function stepState(
  stage: ScientificJobStage,
  step: ScientificJobStage,
): 'done' | 'active' | 'todo' | 'error' {
  if (stage === 'error') {
    // Highlight translate step as the failure anchor (most common)
    if (step === 'running') return 'error';
    if (step === 'checking' || step === 'uploading') return 'done';
    return 'todo';
  }
  const order = PIPELINE_STEPS.indexOf(step);
  const cur = PIPELINE_STEPS.indexOf(stage === 'idle' ? 'checking' : stage);
  if (order < 0) return 'todo';
  if (stage === 'done') return 'done';
  if (order < cur) return 'done';
  if (order === cur) return 'active';
  return 'todo';
}

export function ScientificJobModal({
  progress,
  onCancel,
  onClose,
  onRetry,
  onOpenResult,
  onOpenSetup,
  onDownloadMono,
  onDownloadDual,
  onDownloadSideBySide,
}: ScientificJobModalProps): ReactElement {
  const isDone = progress.stage === 'done';
  const isError = progress.stage === 'error';
  const isActive = !isDone && !isError && progress.stage !== 'idle';
  const offline = progress.errorCode === 'offline';
  const logRef = useRef<HTMLDivElement>(null);
  const meta = SCIENTIFIC_STAGE_META[progress.stage];

  // Auto-scroll log console
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [progress.logs.length]);

  return (
    <div className="pdf-download-modal-backdrop">
      <div
        className="pdf-download-modal pdf-sci-modal"
        role="dialog"
        aria-label="Scientific PDF progress"
        aria-live="polite"
      >
        <div className="pdf-download-modal-header">
          {isError ? (
            <h2 className="pdf-download-modal-title pdf-download-modal-title--error">
              Scientific translation failed
            </h2>
          ) : isDone ? (
            <h2 className="pdf-download-modal-title pdf-download-modal-title--success">
              Scientific translation complete
            </h2>
          ) : (
            <h2 className="pdf-download-modal-title">Scientific layout translation</h2>
          )}
          {progress.jobId && (
            <p className="pdf-sci-job-id" title={progress.jobId}>
              Job {progress.jobId}
            </p>
          )}
        </div>

        {/* Pipeline steps */}
        <ol className="pdf-sci-steps" aria-label="Pipeline stages">
          {PIPELINE_STEPS.map((s) => {
            const st = stepState(progress.stage, s);
            const label = SCIENTIFIC_STAGE_META[s].label;
            return (
              <li
                key={s}
                className={`pdf-sci-step pdf-sci-step--${st}`}
                aria-current={st === 'active' ? 'step' : undefined}
              >
                <span className="pdf-sci-step-dot" aria-hidden />
                <span className="pdf-sci-step-label">{label}</span>
              </li>
            );
          })}
        </ol>

        {/* Progress bar */}
        {(isActive || isDone) && (
          <div className="pdf-download-progress-wrap">
            <div className="pdf-download-progress-bar" aria-hidden>
              <div
                className={`pdf-download-progress-fill${isDone ? ' pdf-download-progress-fill--done' : ''}`}
                style={{ width: formatPercent(progress.progress) }}
              />
            </div>
            <span className="pdf-download-progress-label">{formatPercent(progress.progress)}</span>
          </div>
        )}

        <p className="pdf-download-modal-message">
          <strong className="pdf-sci-status-label">{meta.label}:</strong> {progress.message || meta.hint}
        </p>

        {/* Live log console */}
        {progress.logs.length > 0 && (
          <div className="pdf-sci-log-wrap">
            <div className="pdf-sci-log-header">Activity</div>
            <div
              ref={logRef}
              className="pdf-sci-log"
              role="log"
              aria-label="Scientific job activity log"
            >
              {progress.logs.map((line, i) => (
                <div key={`${i}-${line.slice(0, 24)}`} className="pdf-sci-log-line">
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        {isError && progress.error && (
          <p className="pdf-download-modal-error">{progress.error}</p>
        )}

        {/* Done: format choices */}
        {isDone && (
          <div className="pdf-sci-result-panel">
            <p className="pdf-sci-result-hint">
              Downloads are manual (nothing auto-downloads). Choose a format:
            </p>
            <ul className="pdf-sci-format-list">
              <li>
                <strong>Mono</strong> — translated pages only (layout-preserving).
              </li>
              <li>
                <strong>Dual (pdf2zh)</strong> — bilingual PDF from the bridge (layout engine;
                often original + translation paired — not always strict left|right).
              </li>
              <li>
                <strong>Side-by-side</strong> — original <em>left</em>, translation <em>right</em>{' '}
                (assembled here from original + mono).
              </li>
            </ul>
            <div className="pdf-sci-download-row">
              {progress.hasMono && onDownloadMono && (
                <button
                  type="button"
                  className="pdf-download-btn pdf-download-btn--primary"
                  onClick={onDownloadMono}
                >
                  Download mono
                </button>
              )}
              {progress.hasDual && onDownloadDual && (
                <button
                  type="button"
                  className="pdf-download-btn pdf-download-btn--primary"
                  onClick={onDownloadDual}
                >
                  Download dual
                </button>
              )}
              {progress.hasMono && onDownloadSideBySide && (
                <button
                  type="button"
                  className="pdf-download-btn pdf-download-btn--secondary"
                  onClick={() => void onDownloadSideBySide()}
                >
                  Side-by-side L|R
                </button>
              )}
            </div>
            <div className="pdf-sci-download-row pdf-sci-download-row--secondary">
              {(progress.hasDual || progress.hasMono) && (
                <button
                  type="button"
                  className="pdf-download-btn pdf-download-btn--secondary"
                  onClick={() => onOpenResult(progress.hasDual ? 'dual' : 'mono')}
                >
                  Open {progress.hasDual ? 'dual' : 'mono'} in viewer
                </button>
              )}
            </div>
          </div>
        )}

        <div className="pdf-download-modal-actions">
          {isError && offline && onOpenSetup && (
            <button
              type="button"
              className="pdf-download-btn pdf-download-btn--primary"
              onClick={onOpenSetup}
            >
              Set up / Start server
            </button>
          )}
          {isError && !offline && (
            <button
              type="button"
              className="pdf-download-btn pdf-download-btn--primary"
              onClick={onRetry}
            >
              Retry
            </button>
          )}
          {isActive && (
            <button
              type="button"
              className="pdf-download-btn pdf-download-btn--cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
          {(isDone || isError) && (
            <button
              type="button"
              className="pdf-download-btn pdf-download-btn--secondary"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
