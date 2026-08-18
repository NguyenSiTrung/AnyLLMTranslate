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

function setupProgress(over: Partial<ScientificJobProgress> = {}): ScientificJobProgress {
  return {
    stage: 'idle',
    progress: 0,
    message: '',
    logs: [],
    hasMono: false,
    hasDual: false,
    ...over,
  };
}

interface SetupProps {
  numPages?: number;
  hasPreviousRun?: boolean;
  onStart?: (pages?: string, opts?: { mergeWithPrevious?: boolean }) => void;
}

function renderSetup({
  numPages = 42,
  hasPreviousRun = false,
  onStart = vi.fn(),
}: SetupProps = {}) {
  return render(
    <ScientificJobModal
      progress={setupProgress()}
      fileName="paper.pdf"
      numPages={numPages}
      hasPreviousRun={hasPreviousRun}
      onStart={onStart}
      onCancel={noop}
      onClose={noop}
      onRetry={noop}
      onOpenTranslated={noop}
    />,
  );
}

describe('ScientificJobModal', () => {
  it('done: defaults to side-by-side, and hides cards/actions conditionally', () => {
    const renderResult = render(
      <ScientificJobModal
        progress={baseProgress()}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenTranslated={noop}
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
    renderResult.unmount();

    // hasDual=false hides the bilingual card; translated-only stays.
    const duallessView = render(
      <ScientificJobModal
        progress={baseProgress({ hasDual: false })}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenTranslated={noop}
        onDownloadMono={noop}
        onDownloadSideBySide={noop}
      />,
    );
    expect(screen.queryByRole('radio', { name: /bilingual/i })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /translated only/i })).toBeInTheDocument();
    duallessView.unmount();

    // onOpenCompare omitted → no Compare button.
    render(
      <ScientificJobModal
        progress={baseProgress()}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenTranslated={noop}
        onDownloadMono={noop}
        onDownloadDual={noop}
        onDownloadSideBySide={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: /compare side-by-side/i })).toBeNull();
  });

  it('done: selecting mono updates download CTA and downloadMono is called', () => {
    const onDownloadMono = vi.fn();
    render(
      <ScientificJobModal
        progress={baseProgress()}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenTranslated={noop}
        onDownloadMono={onDownloadMono}
        onDownloadDual={noop}
        onDownloadSideBySide={noop}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /translated only/i }));
    fireEvent.click(screen.getByRole('button', { name: /download translated pdf/i }));
    expect(onDownloadMono).toHaveBeenCalledTimes(1);
  });

  it('done: Open translated and Compare call respective handlers', () => {
    const onOpenTranslated = vi.fn();
    const onOpenCompare = vi.fn();
    render(
      <ScientificJobModal
        progress={baseProgress()}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenTranslated={onOpenTranslated}
        onOpenCompare={onOpenCompare}
        onDownloadMono={noop}
        onDownloadDual={noop}
        onDownloadSideBySide={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /open translated/i }));
    expect(onOpenTranslated).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /compare side-by-side/i }));
    expect(onOpenCompare).toHaveBeenCalledTimes(1);
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
        onOpenTranslated={noop}
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
        onOpenTranslated={noop}
        onOpenSetup={onOpenSetup}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /set up|open setup|start server/i }));
    expect(onOpenSetup).toHaveBeenCalled();
  });

  it('setup: defaults to all pages and starts a whole-document job', () => {
    const onStart = vi.fn();
    renderSetup({ onStart });
    expect(screen.getByRole('radio', { name: /all pages/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: /start translation/i }));
    expect(onStart).toHaveBeenCalledWith(undefined, undefined);
  });

  it('setup: selected pages summarize and start with the raw selection', () => {
    const onStart = vi.fn();
    renderSetup({ onStart });
    fireEvent.click(screen.getByRole('radio', { name: /selected pages/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /page selection/i }), {
      target: { value: '1-3, 5' },
    });
    expect(screen.getByText(/4 of 42 pages/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start translation/i }));
    expect(onStart).toHaveBeenCalledWith('1-3, 5', undefined);
  });

  it('setup: invalid or out-of-range selection disables start and shows the error', () => {
    const onStart = vi.fn();
    renderSetup({ onStart });
    fireEvent.click(screen.getByRole('radio', { name: /selected pages/i }));
    const input = screen.getByRole('textbox', { name: /page selection/i });

    fireEvent.change(input, { target: { value: '99' } });
    expect(screen.getByText(/page 99 is out of range \(1-42\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start translation/i })).toBeDisabled();

    fireEvent.change(input, { target: { value: 'abc' } });
    expect(screen.getByText(/"abc" is not a valid page or range/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start translation/i })).toBeDisabled();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('setup: skips the range check while the page count is still unknown', () => {
    const onStart = vi.fn();
    renderSetup({ numPages: 0, onStart });
    fireEvent.click(screen.getByRole('radio', { name: /selected pages/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /page selection/i }), {
      target: { value: '99' },
    });
    expect(screen.queryByText(/out of range/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start translation/i }));
    expect(onStart).toHaveBeenCalledWith('99', undefined);
  });

  it('setup: cancel closes the dialog without starting', () => {
    const onStart = vi.fn();
    const onClose = vi.fn();
    render(
      <ScientificJobModal
        progress={setupProgress()}
        fileName="paper.pdf"
        numPages={42}
        onStart={onStart}
        onCancel={noop}
        onClose={onClose}
        onRetry={noop}
        onOpenTranslated={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('setup: merge toggle hidden without a previous run, default-on with one', () => {
    const onStart = vi.fn();
    const first = renderSetup({ hasPreviousRun: false, onStart });
    expect(screen.queryByRole('checkbox', { name: /add to previous translation/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /start translation/i }));
    expect(onStart).toHaveBeenCalledWith(undefined, undefined);
    first.unmount();

    renderSetup({ hasPreviousRun: true, onStart });
    const toggle = screen.getByRole('checkbox', { name: /add to previous translation/i });
    expect(toggle).toHaveProperty('checked', true);
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /start translation/i }));
    expect(onStart).toHaveBeenCalledWith(undefined, { mergeWithPrevious: false });
  });

  it('done: shows the result summary when provided', () => {
    render(
      <ScientificJobModal
        progress={baseProgress({ resultSummary: '4 pages translated (merged with previous runs)' })}
        onCancel={noop}
        onClose={noop}
        onRetry={noop}
        onOpenTranslated={noop}
        onDownloadMono={noop}
        onDownloadDual={noop}
        onDownloadSideBySide={noop}
      />,
    );
    expect(
      screen.getByText(/4 pages translated \(merged with previous runs\)/i),
    ).toBeInTheDocument();
  });
});
