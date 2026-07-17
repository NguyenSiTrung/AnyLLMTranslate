import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScientificJobModal } from '../ScientificJobModal';
import type { ScientificJobProgress } from '../../hooks/useScientificPdfJob';

function baseProgress(over: Partial<ScientificJobProgress> = {}): ScientificJobProgress {
  return {
    stage: 'done',
    progress: 1,
    message: 'Complete',
    logs: ['18:00:00 Job succeeded'],
    hasMono: true,
    hasDual: true,
    jobId: 'job_test',
    ...over,
  };
}

const noop = () => {};

describe('ScientificJobModal', () => {
  it('done: defaults to side-by-side and shows recommended badge', () => {
    render(
      <ScientificJobModal
        progress={baseProgress()}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenResult={noop}
        onDownloadMono={noop}
        onDownloadDual={noop}
        onDownloadSideBySide={noop}
      />,
    );
    expect(screen.getByRole('heading', { name: /translation ready/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /side-by-side/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText(/recommended/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download side-by-side/i })).toBeInTheDocument();
    expect(screen.queryByText(/pdf2zh/i)).not.toBeInTheDocument();
  });

  it('done: hides dual card when hasDual is false', () => {
    render(
      <ScientificJobModal
        progress={baseProgress({ hasDual: false })}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenResult={noop}
        onDownloadMono={noop}
        onDownloadSideBySide={noop}
      />,
    );
    expect(screen.queryByRole('radio', { name: /bilingual/i })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /translated only/i })).toBeInTheDocument();
  });

  it('done: selecting mono updates download CTA and downloadMono is called', () => {
    const onDownloadMono = vi.fn();
    render(
      <ScientificJobModal
        progress={baseProgress()}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenResult={noop}
        onDownloadMono={onDownloadMono}
        onDownloadDual={noop}
        onDownloadSideBySide={noop}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /translated only/i }));
    fireEvent.click(screen.getByRole('button', { name: /download translated pdf/i }));
    expect(onDownloadMono).toHaveBeenCalledTimes(1);
  });

  it('done: open in viewer uses mono prefer for side-by-side selection', () => {
    const onOpenResult = vi.fn();
    render(
      <ScientificJobModal
        progress={baseProgress()}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenResult={onOpenResult}
        onDownloadMono={noop}
        onDownloadDual={noop}
        onDownloadSideBySide={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /open in viewer/i }));
    expect(onOpenResult).toHaveBeenCalledWith('mono');
  });

  it('running: activity log is collapsed by default', () => {
    render(
      <ScientificJobModal
        progress={baseProgress({
          stage: 'running',
          progress: 0.4,
          message: 'Translating…',
          logs: ['line 1', 'line 2'],
          hasMono: false,
          hasDual: false,
        })}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenResult={noop}
      />,
    );
    const details = screen.getByText(/activity/i).closest('details');
    expect(details).toBeTruthy();
    expect(details).not.toHaveAttribute('open');
  });

  it('error offline: primary is open setup', () => {
    const onOpenSetup = vi.fn();
    render(
      <ScientificJobModal
        progress={baseProgress({
          stage: 'error',
          progress: 0,
          hasMono: false,
          hasDual: false,
          error: 'Bridge offline',
          errorCode: 'offline',
          logs: ['offline'],
        })}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenResult={noop}
        onOpenSetup={onOpenSetup}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /set up|open setup|start server/i }));
    expect(onOpenSetup).toHaveBeenCalled();
  });
});
