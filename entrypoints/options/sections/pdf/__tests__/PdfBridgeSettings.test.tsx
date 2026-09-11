/**
 * Tests: PDF bridge settings — enable toggle, server URL editing, loopback
 * warning, setup/refresh/guide actions, and always-visible privacy copy.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SCIENTIFIC_PDF_SETTINGS } from '@/types/config';
import { PdfBridgeSettings } from '../PdfBridgeSettings';

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
