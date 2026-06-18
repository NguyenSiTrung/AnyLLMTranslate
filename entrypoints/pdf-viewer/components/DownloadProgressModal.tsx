/**
 * DownloadProgressModal — Multi-stage progress overlay for PDF download.
 *
 * Stages:
 * 1. "Translating remaining pages… (X/N)"
 * 2. "Downloading font…" (only on first download)
 * 3. "Generating PDF… (X/N pages)"
 *
 * Also handles error state with retry, and success with auto-close.
 */

import type { ReactElement } from 'react';

export type DownloadStage = 'translating' | 'font' | 'generating' | 'done' | 'error';

export interface DownloadProgressModalProps {
  /** Current stage of the download pipeline. */
  stage: DownloadStage;
  /** Progress fraction (0–1) for the current stage. */
  progress: number;
  /** Human-readable status message. */
  message: string;
  /** Error message when stage === 'error'. */
  error?: string;
  /** Called when the user clicks Cancel. */
  onCancel: () => void;
  /** Called when the user clicks Retry after an error. */
  onRetry: () => void;
}

/** Format progress as percentage string. */
function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function DownloadProgressModal({
  stage,
  progress,
  message,
  error,
  onCancel,
  onRetry,
}: DownloadProgressModalProps): ReactElement {
  const isDone = stage === 'done';
  const isError = stage === 'error';
  const isActive = !isDone && !isError;

  return (
    <div className="pdf-download-modal-backdrop">
      <div className="pdf-download-modal" role="dialog" aria-label="Download progress">
        {/* Header */}
        <div className="pdf-download-modal-header">
          {isError ? (
            <h2 className="pdf-download-modal-title pdf-download-modal-title--error">
              Download Failed
            </h2>
          ) : isDone ? (
            <h2 className="pdf-download-modal-title pdf-download-modal-title--success">
              Download Complete ✓
            </h2>
          ) : (
            <h2 className="pdf-download-modal-title">Preparing Download…</h2>
          )}
        </div>

        {/* Progress bar */}
        {isActive && (
          <div className="pdf-download-progress-wrap">
            <div className="pdf-download-progress-bar">
              <div
                className="pdf-download-progress-fill"
                style={{ width: formatPercent(progress) }}
              />
            </div>
            <span className="pdf-download-progress-label">{formatPercent(progress)}</span>
          </div>
        )}

        {/* Status message */}
        <p className="pdf-download-modal-message">{message}</p>

        {/* Error details */}
        {isError && error && (
          <p className="pdf-download-modal-error">{error}</p>
        )}

        {/* Actions */}
        <div className="pdf-download-modal-actions">
          {isError && (
            <button
              type="button"
              className="pdf-download-btn pdf-download-btn--primary"
              onClick={onRetry}
            >
              Retry
            </button>
          )}
          <button
            type="button"
            className={`pdf-download-btn ${isError ? 'pdf-download-btn--secondary' : 'pdf-download-btn--cancel'}`}
            onClick={onCancel}
          >
            {isDone ? 'Close' : isError ? 'Cancel' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
