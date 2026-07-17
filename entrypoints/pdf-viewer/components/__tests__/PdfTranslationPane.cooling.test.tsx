/**
 * PDF error UI — pool cooling countdown + gated Retry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PdfTranslationPane } from '../PdfTranslationPane';
import type { PageTranslations } from '../../lib/pdfTranslation';

function errorPage(overrides: Partial<PageTranslations> = {}): PageTranslations {
  return {
    paragraphs: new Map(),
    state: 'error',
    error: 'All providers are cooling down or rate-limited. Wait for cooldown, then retry.',
    ...overrides,
  };
}

describe('PdfTranslationPane cooling countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('disables Retry and shows countdown while retryAfter is in the future', () => {
    const onRetry = vi.fn();
    const retryAfter = Date.now() + 65_000; // 1:05

    render(
      <PdfTranslationPane
        pageNumber={3}
        page={errorPage({ retryAfter })}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/Providers cooling/i);
    expect(screen.getByRole('status')).toHaveTextContent(/1:05|1:04/);
    const btn = screen.getByRole('button', { name: /Retry in/i });
    expect(btn).toBeDisabled();
  });

  it('enables Retry when cooldown elapses', () => {
    const onRetry = vi.fn();
    const retryAfter = Date.now() + 2_000;

    render(
      <PdfTranslationPane
        pageNumber={1}
        page={errorPage({ retryAfter })}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('button', { name: /Retry in/i })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(2_100);
    });

    const btn = screen.getByRole('button', { name: /^Retry$/i });
    expect(btn).not.toBeDisabled();
  });

  it('keeps Retry enabled when error has no retryAfter', () => {
    render(
      <PdfTranslationPane
        pageNumber={2}
        page={errorPage({ error: 'network failed' })}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: /^Retry$/i })).not.toBeDisabled();
  });
});
