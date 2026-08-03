/**
 * Tests: Toast action-button support (used by the import Undo toast).
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider, useToast } from '@/ui/ToastProvider';
import type { ToastAction } from '@/ui/Toast';

function Harness({ action, message }: { action?: ToastAction; message: string }) {
  const { successWithAction, success } = useToast();
  return (
    <button
      type="button"
      onClick={() => (action ? successWithAction(message, action) : success(message))}
    >
      show
    </button>
  );
}

describe('Toast action', () => {
  it('renders an action button, invokes onClick and dismisses; no-action toasts stay plain', async () => {
    const onClick = vi.fn();
    const view = render(
      <ToastProvider>
        <Harness action={{ label: 'Undo import', onClick }} message="Imported 2 settings" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'show' }));
    expect(screen.getByText('Imported 2 settings')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo import' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByText('Imported 2 settings')).not.toBeInTheDocument(),
    );

    // No-action toasts render no action button and behave as before.
    view.unmount();
    render(
      <ToastProvider>
        <Harness message="Plain success" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'show' }));
    expect(screen.getByText('Plain success')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
  });
});
