/**
 * DownloadProgressModal — Multi-stage progress overlay for PDF download.
 *
 * Stages:
 * 1. "Translating remaining pages… (X/N)"
 * 2. "Downloading font…"
 * 3. "Generating PDF… (X/N pages)"
 * 4. "Assembling dual PDF…" (side-by-side / alternating only)
 *
 * Also handles error state with retry, and success with auto-close.
 * Optional format picker when `showFormatPicker` is true (pre-start UX).
 */

import type { ReactElement } from 'react';
import type { DualExportMode } from '../lib/pdfDualExport';

export type DownloadStage =
  | 'translating'
  | 'font'
  | 'generating'
  | 'assembling'
  | 'done'
  | 'error';

export interface DownloadProgressModalProps {
  /** Current stage of the download pipeline. */
  stage: DownloadStage;
  /** Progress fraction (0–1) for the current stage. */
  progress: number;
  /** Human-readable status message. */
  message: string;
  /** Error message when stage === 'error'. */
  error?: string;
  /** Called when the user clicks Cancel / Close. */
  onCancel: () => void;
  /** Called when the user clicks Retry after an error. */
  onRetry: () => void;
  /** Active export mode (shown in header copy). */
  exportMode?: DualExportMode;
}

/** Format progress as percentage string. */
function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function modeLabel(mode: DualExportMode | undefined): string {
  switch (mode) {
    case 'dual-side-by-side':
      return 'Dual (side-by-side)';
    case 'dual-alternating':
      return 'Dual (alternating)';
    case 'mono':
    default:
      return 'Mono (translated only)';
  }
}

export function DownloadProgressModal({
  stage,
  progress,
  message,
  error,
  onCancel,
  onRetry,
  exportMode,
}: DownloadProgressModalProps): ReactElement {
  const isDone = stage === 'done';
  const isError = stage === 'error';
  const isActive = !isDone && !isError;

  return (
    <div className="pdf-download-modal-backdrop">
      <div className="pdf-download-modal" role="dialog" aria-label="Download progress">
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
            <h2 className="pdf-download-modal-title">
              Preparing {modeLabel(exportMode)}…
            </h2>
          )}
        </div>

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

        <p className="pdf-download-modal-message">{message}</p>

        {isError && error && (
          <p className="pdf-download-modal-error">{error}</p>
        )}

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
            {isDone ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface DownloadFormatPickerProps {
  /** Currently selected format. */
  value: DualExportMode;
  onChange: (mode: DualExportMode) => void;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

const FORMAT_OPTIONS: Array<{ mode: DualExportMode; label: string; hint: string }> = [
  {
    mode: 'mono',
    label: 'Mono',
    hint: 'Translated pages only',
  },
  {
    mode: 'dual-side-by-side',
    label: 'Dual side-by-side',
    hint: 'Original left, translation right',
  },
  {
    mode: 'dual-alternating',
    label: 'Dual alternating',
    hint: 'O1, T1, O2, T2…',
  },
];

/**
 * Pre-download format picker modal.
 */
export function DownloadFormatPicker({
  value,
  onChange,
  onConfirm,
  onCancel,
  disabled,
}: DownloadFormatPickerProps): ReactElement {
  return (
    <div className="pdf-download-modal-backdrop">
      <div className="pdf-download-modal" role="dialog" aria-label="Choose download format">
        <div className="pdf-download-modal-header">
          <h2 className="pdf-download-modal-title">Download format</h2>
        </div>
        <p className="pdf-download-modal-message">
          Choose mono translation or a bilingual dual PDF.
        </p>
        <div className="pdf-download-format-list" role="radiogroup" aria-label="Export format">
          {FORMAT_OPTIONS.map((opt) => (
            <label
              key={opt.mode}
              className={`pdf-download-format-option${value === opt.mode ? ' pdf-download-format-option--active' : ''}`}
            >
              <input
                type="radio"
                name="pdf-export-format"
                value={opt.mode}
                checked={value === opt.mode}
                onChange={() => onChange(opt.mode)}
                disabled={disabled}
              />
              <span className="pdf-download-format-label">{opt.label}</span>
              <span className="pdf-download-format-hint">{opt.hint}</span>
            </label>
          ))}
        </div>
        <div className="pdf-download-modal-actions">
          <button
            type="button"
            className="pdf-download-btn pdf-download-btn--primary"
            onClick={onConfirm}
            disabled={disabled}
          >
            Download
          </button>
          <button
            type="button"
            className="pdf-download-btn pdf-download-btn--cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
