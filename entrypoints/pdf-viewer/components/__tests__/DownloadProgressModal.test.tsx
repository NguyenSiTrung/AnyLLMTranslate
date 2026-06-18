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

  it('renders progress bar during active stages', () => {
    render(<DownloadProgressModal {...baseProps} />);
    expect(screen.getByText('Preparing Download…')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText('Translating remaining pages… (3/6)')).toBeTruthy();
  });

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

  it('calls onCancel when cancel button is clicked during active stage', () => {
    const onCancel = vi.fn();
    render(<DownloadProgressModal {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('does not render progress bar in error state', () => {
    render(
      <DownloadProgressModal
        {...baseProps}
        stage="error"
        error="Something went wrong"
        message="Error"
      />,
    );
    expect(screen.queryByText('50%')).toBeNull();
  });

  it('renders with font download stage', () => {
    render(
      <DownloadProgressModal
        {...baseProps}
        stage="font"
        progress={0.75}
        message="Downloading font…"
      />,
    );
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('Downloading font…')).toBeTruthy();
  });
});
