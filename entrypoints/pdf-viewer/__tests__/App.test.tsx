/**
 * App wiring for the pre-start page selection flow:
 * Translate opens the setup modal (no auto-start); Start launches the job;
 * Retry returns to setup; the source pane's page count powers the range UI.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ScientificJobProgress } from '../hooks/useScientificPdfJob';

const scientific = vi.hoisted(() => ({
  healthOk: true as boolean | null,
  isRunning: false,
  hasPreviousRun: false,
  bridgeStatus: 'ready',
  progress: {
    stage: 'idle',
    progress: 0,
    message: '',
    logs: [] as string[],
    hasMono: false,
    hasDual: false,
  } as ScientificJobProgress,
  refreshHealth: vi.fn(async () => true),
  startJob: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
  reset: vi.fn(),
  dismissProgress: vi.fn(),
  resolveResultUrl: vi.fn(() => null),
  resolveResultBlob: vi.fn(() => null),
  openResultInViewer: vi.fn(() => null),
  downloadMono: vi.fn(),
  downloadDual: vi.fn(),
  downloadSideBySide: vi.fn(async () => {}),
}));

vi.mock('../hooks/useScientificPdfJob', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useScientificPdfJob: () => scientific };
});
vi.mock('../components/ViewerLayout', () => ({
  ViewerLayout: ({
    headerExtra,
    reader,
  }: {
    headerExtra: React.ReactNode;
    reader: React.ReactNode;
  }) => (
    <div>
      <div data-testid="header-extra">{headerExtra}</div>
      <div data-testid="reader-pane">{reader}</div>
    </div>
  ),
}));
vi.mock('../components/PdfDocumentPane', () => ({
  PdfDocumentPane: ({ onNumPages }: { onNumPages?: (n: number) => void }) => (
    <button type="button" data-testid="pane-pages" onClick={() => onNumPages?.(42)} />
  ),
}));
vi.mock('../components/BridgeSetupCard', () => ({ BridgeSetupCard: () => null }));

import App from '../App';

describe('pdf-viewer App page selection wiring', () => {
  beforeEach(() => {
    scientific.healthOk = true;
    scientific.isRunning = false;
    scientific.hasPreviousRun = false;
    scientific.progress = {
      stage: 'idle',
      progress: 0,
      message: '',
      logs: [],
      hasMono: false,
      hasDual: false,
    };
    scientific.startJob.mockClear();
    scientific.dismissProgress.mockClear();
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({}),
        openOptionsPage: vi.fn(),
      },
    });
    window.history.replaceState(null, '', '?file=https%3A%2F%2Fexample.com%2Fa.pdf');
  });

  it('Translate opens the setup stage without starting the job', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^translate$/i }));
    expect(screen.getByRole('button', { name: /start translation/i })).toBeInTheDocument();
    expect(scientific.startJob).not.toHaveBeenCalled();
  });

  it('Start translation launches the job with no page selection by default', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^translate$/i }));
    fireEvent.click(screen.getByRole('button', { name: /start translation/i }));
    expect(scientific.startJob).toHaveBeenCalledWith({});
  });

  it('Start translation forwards a page selection to the job', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^translate$/i }));
    fireEvent.click(screen.getByRole('radio', { name: /selected pages/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /page selection/i }), {
      target: { value: '2-4' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start translation/i }));
    expect(scientific.startJob).toHaveBeenCalledWith({ pages: '2-4' });
  });

  it('merge toggle: hidden without a previous run, forwarded when present', () => {
    // No previous run → no toggle, default merge behavior (hook decides).
    const first = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^translate$/i }));
    expect(screen.queryByRole('checkbox', { name: /add to previous translation/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /start translation/i }));
    expect(scientific.startJob).toHaveBeenCalledWith({});
    first.unmount();

    // Previous run exists → toggle shown, default on.
    scientific.hasPreviousRun = true;
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^translate$/i }));
    const toggle = screen.getByRole('checkbox', { name: /add to previous translation/i });
    expect(toggle).toHaveProperty('checked', true);
    fireEvent.click(screen.getByRole('radio', { name: /selected pages/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /page selection/i }), {
      target: { value: '6-16' },
    });
    fireEvent.click(toggle); // off
    fireEvent.click(screen.getByRole('button', { name: /start translation/i }));
    expect(scientific.startJob).toHaveBeenCalledWith({
      pages: '6-16',
      mergeWithPrevious: false,
    });
  });

  it('the source pane page count is shown in the setup stage', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('pane-pages'));
    fireEvent.click(screen.getByRole('button', { name: /^translate$/i }));
    expect(screen.getByRole('radio', { name: /all pages \(1-42\)/i })).toBeInTheDocument();
  });

  it('Retry returns to the setup stage instead of restarting immediately', () => {
    scientific.progress = {
      stage: 'error',
      progress: 0,
      message: 'failed',
      logs: [],
      hasMono: false,
      hasDual: false,
      error: 'LLM error',
      errorCode: 'llm_error',
    };
    // Mirror the real hook: dismissProgress resets the stage to idle.
    scientific.dismissProgress.mockImplementation(() => {
      scientific.progress = {
        stage: 'idle',
        progress: 0,
        message: '',
        logs: [],
        hasMono: false,
        hasDual: false,
      };
    });
    const view = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(scientific.dismissProgress).toHaveBeenCalled();
    expect(scientific.startJob).not.toHaveBeenCalled();
    // The mocked hook has no internal state — re-render to read the reset stage.
    view.rerender(<App />);
    expect(screen.getByRole('button', { name: /start translation/i })).toBeInTheDocument();
  });
});
