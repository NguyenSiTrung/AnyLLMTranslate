/**
 * DownloadProgressModal — Tests for multi-stage progress modal.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DownloadProgressModal } from '../DownloadProgressModal';

describe('DownloadProgressModal', () => {
  const baseProps = {
    stage: 'translating' as const,
    progress: 0.5,
    message: 'Translating remaining pages… (3/6)',
    error: undefined,
    onCancel: vi.fn(),
    onRetry: vi.fn(),
  };

  it('shows error state with retry and cancel buttons', () => {
    const onRetry = vi.fn();
    const onCancel = vi.fn();
    render(
      <DownloadProgressModal
        {...baseProps}
        stage="error"
        error="LLM request failed"
        message="Some pages failed to translate"
        onRetry={onRetry}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText('Download Failed')).toBeTruthy();
    expect(screen.getByText('LLM request failed')).toBeTruthy();
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows success state when done', () => {
    render(
      <DownloadProgressModal
        {...baseProps}
        stage="done"
        progress={1}
        message="Download complete!"
      />,
    );
    expect(screen.getByText('Download Complete ✓')).toBeTruthy();
    expect(screen.getByText('Download complete!')).toBeTruthy();
  });
});
