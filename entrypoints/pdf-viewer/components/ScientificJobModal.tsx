/**
 * Progress / result modal for Scientific PDF bridge jobs.
 * State-focused UX: calm running, clear error recovery, download-first done cards.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { parsePageSelection } from '@/lib/pdfPageSelection';
import {
  SCIENTIFIC_STAGE_META,
  type ScientificJobProgress,
  type ScientificJobStage,
} from '../hooks/useScientificPdfJob';
import {
  availableFormats,
  defaultFormat,
  formatCardCopy,
  isRecommended,
  type ScientificDownloadFormat,
} from './scientificJobModalFormats';

export interface ScientificJobModalProps {
  progress: ScientificJobProgress;
  onCancel: () => void;
  onClose: () => void;
  onRetry: () => void;
  /** Open translated-only in reader */
  onOpenTranslated: () => void;
  /** Open original|result compare; hide button if undefined */
  onOpenCompare?: () => void;
  onOpenSetup?: () => void;
  onDownloadMono?: () => void;
  onDownloadDual?: () => void;
  onDownloadSideBySide?: () => void | Promise<void>;
  /** Source file name shown in the pre-start setup stage. */
  fileName?: string;
  /** Total source pages (0/undefined while the document is still loading). */
  numPages?: number;
  /** Whether a previous successful run exists for this document. */
  hasPreviousRun?: boolean;
  /**
   * Show the pre-start setup stage (choose pages) when provided.
   * Called with the raw pdf2zh-style selection (undefined = all pages) and
   * the merge preference when a previous run exists.
   */
  onStart?: (pages?: string, opts?: { mergeWithPrevious?: boolean }) => void;
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
  onOpenTranslated,
  onOpenCompare,
  onOpenSetup,
  onDownloadMono,
  onDownloadDual,
  onDownloadSideBySide,
  fileName,
  numPages = 0,
  hasPreviousRun = false,
  onStart,
}: ScientificJobModalProps): ReactElement {
  const isDone = progress.stage === 'done';
  const isError = progress.stage === 'error';
  const isActive = !isDone && !isError && progress.stage !== 'idle';
  const isSetup = progress.stage === 'idle' && Boolean(onStart);
  const offline = progress.errorCode === 'offline';
  const meta = SCIENTIFIC_STAGE_META[progress.stage];

  const [pageMode, setPageMode] = useState<'all' | 'selected'>('all');
  const [pageInput, setPageInput] = useState('');
  const [mergeWithPrevious, setMergeWithPrevious] = useState(true);
  const pageSelection = useMemo(
    () => parsePageSelection(pageInput, numPages),
    [pageInput, numPages],
  );
  const selectedPagesInvalid = pageMode === 'selected' && Boolean(pageSelection.error);

  const flags = useMemo(
    () => ({ hasMono: progress.hasMono, hasDual: progress.hasDual }),
    [progress.hasMono, progress.hasDual],
  );
  const formats = useMemo(() => availableFormats(flags), [flags]);
  const formatsKey = formats.join('|');

  const [selected, setSelected] = useState<ScientificDownloadFormat | null>(null);
  useEffect(() => {
    if (!isDone) {
      setSelected(null);
      return;
    }
    setSelected((prev) => {
      if (prev && formats.includes(prev)) return prev;
      return defaultFormat(flags);
    });
  }, [isDone, flags, formats, formatsKey]);

  const [logOpen, setLogOpen] = useState(false);
  useEffect(() => {
    if (isError) setLogOpen(true);
    else if (isDone || isActive) setLogOpen(false);
  }, [isError, isDone, isActive, progress.stage]);

  const [downloadPhase, setDownloadPhase] = useState<'idle' | 'busy' | 'saved'>('idle');
  useEffect(() => {
    if (!isDone) setDownloadPhase('idle');
  }, [isDone]);

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!logOpen) return;
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [progress.logs.length, logOpen]);

  const titleId = 'pdf-sci-title';
  const title = isError
    ? 'Translation failed'
    : isDone
      ? 'Translation ready'
      : isSetup
        ? 'Translate PDF'
        : 'Translating with Scientific layout…';

  const selectedCopy = selected ? formatCardCopy(selected) : null;

  async function handlePrimaryDownload(): Promise<void> {
    if (!selected) return;
    setDownloadPhase('busy');
    try {
      if (selected === 'mono') {
        onDownloadMono?.();
      } else if (selected === 'dual') {
        onDownloadDual?.();
      } else {
        await Promise.resolve(onDownloadSideBySide?.());
      }
      setDownloadPhase('saved');
      window.setTimeout(() => setDownloadPhase('idle'), 2000);
    } catch {
      setDownloadPhase('idle');
    }
  }

  const primaryDownloadLabel =
    downloadPhase === 'busy'
      ? selected === 'side-by-side'
        ? 'Assembling…'
        : 'Downloading…'
      : (selectedCopy?.downloadLabel ?? 'Download');

  return (
    <div className="pdf-download-modal-backdrop">
      <div
        className="pdf-download-modal pdf-sci-modal"
        role="dialog"
        aria-labelledby={titleId}
        aria-live="polite"
      >
        <div className="pdf-download-modal-header">
          <h2
            id={titleId}
            className={
              isError
                ? 'pdf-download-modal-title pdf-download-modal-title--error'
                : isDone
                  ? 'pdf-download-modal-title pdf-download-modal-title--success'
                  : 'pdf-download-modal-title'
            }
          >
            {isDone ? `${title} ✓` : title}
          </h2>
          {progress.jobId && (
            <p className="pdf-sci-job-id" title={progress.jobId}>
              Job {progress.jobId}
            </p>
          )}
        </div>

        {isSetup && (
          <div className="pdf-sci-setup">
            {(fileName || numPages > 0) && (
              <p className="pdf-sci-setup-file">
                {fileName}
                {numPages > 0 && <span> · {numPages} pages</span>}
              </p>
            )}
            <div className="pdf-sci-pages" role="radiogroup" aria-label="Pages to translate">
              <button
                type="button"
                role="radio"
                aria-checked={pageMode === 'all'}
                className={`pdf-sci-pages-option${pageMode === 'all' ? ' pdf-sci-pages-option--active' : ''}`}
                onClick={() => setPageMode('all')}
              >
                All pages{numPages > 0 ? ` (1-${numPages})` : ''}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={pageMode === 'selected'}
                className={`pdf-sci-pages-option${pageMode === 'selected' ? ' pdf-sci-pages-option--active' : ''}`}
                onClick={() => setPageMode('selected')}
              >
                Selected pages
              </button>
            </div>
            {pageMode === 'selected' && (
              <div className="pdf-sci-pages-custom">
                <input
                  type="text"
                  className="pdf-sci-pages-input"
                  aria-label="Page selection"
                  placeholder="e.g. 1-3, 5, 8-10"
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  spellCheck={false}
                />
                {pageSelection.error ? (
                  <p className="pdf-sci-pages-error" role="alert">
                    {pageSelection.error}
                  </p>
                ) : pageInput.trim() ? (
                  <p className="pdf-sci-pages-summary">
                    {numPages > 0
                      ? `${pageSelection.pages.length} of ${numPages} pages · ${Math.round(
                          (pageSelection.pages.length / numPages) * 100,
                        )}% of the document`
                      : `${pageSelection.pages.length} pages`}
                  </p>
                ) : (
                  <p className="pdf-sci-pages-summary pdf-sci-pages-summary--hint">
                    Comma-separated pages and ranges, e.g. 1-3, 5, 8-10
                  </p>
                )}
              </div>
            )}
            {hasPreviousRun && (
              <label className="pdf-sci-merge-toggle">
                <input
                  type="checkbox"
                  checked={mergeWithPrevious}
                  onChange={(e) => setMergeWithPrevious(e.target.checked)}
                />
                <span>
                  Add to previous translation
                  <small>
                    Result combines all runs so far; pages you translate now override
                    earlier translations of the same page.
                  </small>
                </span>
              </label>
            )}
          </div>
        )}

        {(isActive || isDone) && (
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
        )}

        {(isActive || isDone) && (
          <div className="pdf-download-progress-wrap">
            <div
              className="pdf-download-progress-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress.progress * 100)}
            >
              <div
                className={`pdf-download-progress-fill${isDone ? ' pdf-download-progress-fill--done' : ''}`}
                style={{ width: formatPercent(progress.progress) }}
              />
            </div>
            <span className="pdf-download-progress-label">{formatPercent(progress.progress)}</span>
          </div>
        )}

        {!isSetup &&
          (isDone ? (
            <p className="pdf-download-modal-message">
              {progress.resultSummary
                ? `${progress.resultSummary}. Choose a format, then download. Nothing downloads automatically.`
                : 'Choose a format, then download. Nothing downloads automatically.'}
            </p>
          ) : isError ? null : (
            <p className="pdf-download-modal-message">
              <strong className="pdf-sci-status-label">{meta.label}:</strong>{' '}
              {progress.message || meta.hint}
            </p>
          ))}

        {isError && progress.error && (
          <p className="pdf-download-modal-error">{progress.error}</p>
        )}

        {isDone && formats.length > 0 && (
          <div className="pdf-sci-result-panel">
            <div className="pdf-sci-format-cards" role="radiogroup" aria-label="Download format">
              {formats.map((f) => {
                const copy = formatCardCopy(f);
                const checked = selected === f;
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={copy.title}
                    className={`pdf-sci-format-card${checked ? ' pdf-sci-format-card--selected' : ''}`}
                    onClick={() => setSelected(f)}
                  >
                    <span
                      className={`pdf-sci-format-glyph pdf-sci-format-glyph--${f}`}
                      aria-hidden
                    />
                    <span className="pdf-sci-format-card-text">
                      <span className="pdf-sci-format-card-title">
                        {copy.title}
                        {isRecommended(f, flags) && (
                          <span className="pdf-sci-recommended">Recommended</span>
                        )}
                      </span>
                      <span className="pdf-sci-format-card-hint">{copy.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="pdf-download-btn pdf-download-btn--primary pdf-sci-download-primary"
              disabled={!selected || downloadPhase === 'busy'}
              onClick={() => void handlePrimaryDownload()}
            >
              {primaryDownloadLabel}
            </button>
            {downloadPhase === 'saved' && (
              <p className="pdf-sci-feedback" role="status">
                Download started
              </p>
            )}

            <div className="pdf-sci-download-row pdf-sci-download-row--secondary">
              {(progress.hasDual || progress.hasMono) && (
                <button
                  type="button"
                  className="pdf-download-btn pdf-download-btn--secondary"
                  onClick={onOpenTranslated}
                >
                  Open translated
                </button>
              )}
              {onOpenCompare && (progress.hasDual || progress.hasMono) && (
                <button
                  type="button"
                  className="pdf-download-btn pdf-download-btn--secondary"
                  onClick={onOpenCompare}
                >
                  Compare side-by-side
                </button>
              )}
            </div>
          </div>
        )}

        {progress.logs.length > 0 && (
          <details
            className="pdf-sci-log-wrap"
            open={logOpen}
            onToggle={(e) => setLogOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary className="pdf-sci-log-header">Activity</summary>
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
          </details>
        )}

        <div className="pdf-download-modal-actions">
          {isSetup && (
            <>
              <button
                type="button"
                className="pdf-download-btn pdf-download-btn--secondary"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pdf-download-btn pdf-download-btn--primary"
                disabled={selectedPagesInvalid}
                onClick={() =>
                  onStart?.(
                    pageMode === 'all' ? undefined : pageInput.trim(),
                    hasPreviousRun ? { mergeWithPrevious } : undefined,
                  )
                }
              >
                Start translation
              </button>
            </>
          )}
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
