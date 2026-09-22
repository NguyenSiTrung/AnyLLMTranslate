import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_PDF_SETTINGS, DEFAULT_SCIENTIFIC_PDF_SETTINGS } from '@/types/config';
import { PdfBridgeSettings } from '../PdfBridgeSettings';
import { PdfOpenBehavior } from '../PdfOpenBehavior';
import { PdfSiteExceptions } from '../PdfSiteExceptions';
import { PdfStatusPanel } from '../PdfStatusPanel';

/**
 * Tests: PDF bridge settings — enable toggle, server URL editing, loopback
 * warning, setup/refresh/guide actions, and always-visible privacy copy.
 */

function renderCard(overrides = {}, handlers = {}) {
  const props = {
    value: { ...DEFAULT_SCIENTIFIC_PDF_SETTINGS, ...overrides },
    checking: false,
    onChange: vi.fn(),
    onSetup: vi.fn(),
    onRefresh: vi.fn(),
    ...handlers,
  };
  render(<PdfBridgeSettings {...props} />);
  return props;
}

describe('PdfBridgeSettings', () => {
  it('patches enabled and serverUrl while preserving other fields', () => {
    const props = renderCard({ setupCompletedAt: 123 });
    fireEvent.click(screen.getByRole('switch', { name: /enable pdf bridge/i }));
    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, setupCompletedAt: 123 }),
    );

    fireEvent.change(screen.getByLabelText(/bridge server url/i), {
      target: { value: 'http://127.0.0.1:9999' },
    });
    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ serverUrl: 'http://127.0.0.1:9999' }),
    );
  });

  it('warns when the server URL is not loopback', () => {
    renderCard({ serverUrl: 'https://remote.example.com' });
    expect(screen.getByText(/not loopback/i)).toBeInTheDocument();
  });

  it('invokes setup and refresh actions', () => {
    const props = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /set up/i }));
    expect(props.onSetup).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /refresh status/i }));
    expect(props.onRefresh).toHaveBeenCalled();
  });

  it('always shows privacy copy', () => {
    renderCard();
    expect(screen.getByText(/privacy:/i)).toBeInTheDocument();
  });
});

/**
 * Tests: PDF open behavior — autoOpen/openMode persistence, conditional
 * site exceptions, and field-preserving patches.
 */

function renderOpenBehaviorCard(settings = DEFAULT_PDF_SETTINGS, onChange = vi.fn()) {
  render(<PdfOpenBehavior value={settings} onChange={onChange} />);
  return onChange;
}

describe('PdfOpenBehavior', () => {
  it('patches autoOpen while preserving other fields', () => {
    const onChange = renderOpenBehaviorCard({ ...DEFAULT_PDF_SETTINGS, openMode: 'same-tab' });
    fireEvent.click(screen.getByRole('radio', { name: /prompt/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ autoOpen: 'prompt', openMode: 'same-tab' }),
    );
  });

  it('patches openMode to new-tab', () => {
    const onChange = renderOpenBehaviorCard();
    fireEvent.click(screen.getByRole('radio', { name: /new tab/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ openMode: 'new-tab' }),
    );
  });

  it('shows site exceptions only when auto-open is enabled', () => {
    const { rerender } = render(
      <PdfOpenBehavior value={DEFAULT_PDF_SETTINGS} onChange={vi.fn()} />,
    );
    expect(screen.queryByText(/never open automatically/i)).not.toBeInTheDocument();

    rerender(
      <PdfOpenBehavior
        value={{ ...DEFAULT_PDF_SETTINGS, autoOpen: 'prompt' }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/never open automatically/i)).toBeInTheDocument();
  });

  it('persists site exception changes through onChange', () => {
    const onChange = renderOpenBehaviorCard({ ...DEFAULT_PDF_SETTINGS, autoOpen: 'auto' });
    fireEvent.change(screen.getByLabelText(/site to exclude/i), {
      target: { value: 'Example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add site/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ neverAutoOpenSites: ['example.com'] }),
    );
  });
});

/**
 * Tests: PDF site-exception chip editor — normalized adds, dedupe, removal,
 * and inline validation. Draft text never mutates persisted settings.
 */

describe('PdfSiteExceptions', () => {
  it('adds normalized hosts and removes chips, and rejects invalid input inline', () => {
    // facet: adds normalized hosts and removes chips
    const onChange = vi.fn();
    render(<PdfSiteExceptions value={['arxiv.org']} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/site to exclude/i), {
      target: { value: 'https://Example.com/paper.pdf' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add site/i }));
    expect(onChange).toHaveBeenCalledWith(['arxiv.org', 'example.com']);

    fireEvent.click(screen.getByRole('button', { name: /remove arxiv\.org/i }));
    expect(onChange).toHaveBeenCalledWith([]);
    cleanup();

    // facet: rejects invalid input inline without calling onChange
    const invalidOnChange = vi.fn();
    render(<PdfSiteExceptions value={[]} onChange={invalidOnChange} />);

    fireEvent.change(screen.getByLabelText(/site to exclude/i), {
      target: { value: 'not a host' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add site/i }));

    expect(invalidOnChange).not.toHaveBeenCalled();
    expect(screen.getByText(/valid http/i)).toBeInTheDocument();
  });
});

/**
 * Tests: PDF bridge status panel — one readiness state with a single
 * state-appropriate primary action.
 */

function renderPanel(status: 'not_configured' | 'offline' | 'ready') {
  return render(
    <PdfStatusPanel
      status={status}
      checking={false}
      error={null}
      onSetup={vi.fn()}
      onRefresh={vi.fn()}
      onShowUsage={vi.fn()}
    />,
  );
}

describe('PdfStatusPanel', () => {
  it('renders each state with its primary action', () => {
    const cases = [
      ['not_configured', 'Not configured', 'Set up PDF translation'],
      ['offline', 'Bridge offline', 'Check connection'],
      ['ready', 'Ready', 'How to translate a PDF'],
    ] as const;
    for (const [status, label, action] of cases) {
      cleanup();
      renderPanel(status);
      expect(screen.getByText(label), status).toBeInTheDocument();
      expect(screen.getByRole('button', { name: action }), status).toBeInTheDocument();
    }
  });
});
