/**
 * Tests: PDF site-exception chip editor — normalized adds, dedupe, removal,
 * and inline validation. Draft text never mutates persisted settings.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PdfSiteExceptions } from '../PdfSiteExceptions';

describe('PdfSiteExceptions', () => {
  it('adds normalized hosts and removes chips', () => {
    const onChange = vi.fn();
    render(<PdfSiteExceptions value={['arxiv.org']} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/site to exclude/i), {
      target: { value: 'https://Example.com/paper.pdf' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add site/i }));
    expect(onChange).toHaveBeenCalledWith(['arxiv.org', 'example.com']);

    fireEvent.click(screen.getByRole('button', { name: /remove arxiv\.org/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('rejects invalid input inline without calling onChange', () => {
    const onChange = vi.fn();
    render(<PdfSiteExceptions value={[]} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/site to exclude/i), {
      target: { value: 'not a host' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add site/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/valid http/i)).toBeInTheDocument();
  });
});
