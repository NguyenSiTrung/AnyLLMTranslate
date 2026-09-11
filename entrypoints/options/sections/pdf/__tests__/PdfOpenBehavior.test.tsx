/**
 * Tests: PDF open behavior — autoOpen/openMode persistence, conditional
 * site exceptions, and field-preserving patches.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_PDF_SETTINGS } from '@/types/config';
import { PdfOpenBehavior } from '../PdfOpenBehavior';

function renderCard(settings = DEFAULT_PDF_SETTINGS, onChange = vi.fn()) {
  render(<PdfOpenBehavior value={settings} onChange={onChange} />);
  return onChange;
}

describe('PdfOpenBehavior', () => {
  it('patches autoOpen while preserving other fields', () => {
    const onChange = renderCard({ ...DEFAULT_PDF_SETTINGS, openMode: 'same-tab' });
    fireEvent.click(screen.getByRole('radio', { name: /prompt/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ autoOpen: 'prompt', openMode: 'same-tab' }),
    );
  });

  it('patches openMode to new-tab', () => {
    const onChange = renderCard();
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
    const onChange = renderCard({ ...DEFAULT_PDF_SETTINGS, autoOpen: 'auto' });
    fireEvent.change(screen.getByLabelText(/site to exclude/i), {
      target: { value: 'Example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add site/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ neverAutoOpenSites: ['example.com'] }),
    );
  });
});
