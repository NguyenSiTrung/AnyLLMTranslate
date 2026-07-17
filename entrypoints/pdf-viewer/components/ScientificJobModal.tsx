/**
 * Progress / result modal for Scientific PDF bridge jobs.
 */

import type { ReactElement } from 'react';
import type { ScientificJobProgress } from '../hooks/useScientificPdfJob';

export interface ScientificJobModalProps {
  progress: ScientificJobProgress;
  onCancel: () => void;
  onClose: () => void;
  onRetry: () => void;
  onOpenResult: () => void;
  onOpenSetup?: () => void;
}

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function ScientificJobModal({
  progress,
  onCancel,
  onClose,
  onRetry,
  onOpenResult,
  onOpenSetup,
}: ScientificJobModalProps): ReactElement {
  const isDone = progress.stage === 'done';
  const isError = progress.stage === 'error';
  const isActive = !isDone && !isError && progress.stage !== 'idle';
  const offline = progress.errorCode === 'offline';

  return (
    <div className="pdf-download-modal-backdrop">
      <div className="pdf-download-modal" role="dialog" aria-label="Scientific PDF progress">
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
            <h2 className="pdf-download-modal-title">Scientific layout…</h2>
          )}
        </div>

        {isActive && (
          <div className="pdf-download-progress-wrap">
            <div className="pdf-download-progress-bar">
              <div
                className="pdf-download-progress-fill"
                style={{ width: formatPercent(progress.progress) }}
              />
            </div>
            <span className="pdf-download-progress-label">
              {formatPercent(progress.progress)}
            </span>
          </div>
        )}

        <p className="pdf-download-modal-message">{progress.message}</p>

        {isError && progress.error && (
          <p className="pdf-download-modal-error">{progress.error}</p>
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
          {isDone && (progress.dualUrl || progress.monoUrl) && (
            <button
              type="button"
              className="pdf-download-btn pdf-download-btn--primary"
              onClick={onOpenResult}
            >
              Open {progress.dualUrl ? 'dual' : 'mono'} in viewer
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
