import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BackupPasswordDialog, ImportSummaryDialog } from '../BackupDialogs';

describe('BackupPasswordDialog', () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    onConfirm.mockClear();
    onCancel.mockClear();
  });

  it('blocks submit until a matching 8+ char password is entered (export mode)', () => {
    render(
      <BackupPasswordDialog
        title="Encrypt backup"
        message="Choose a passphrase"
        confirmLabel="Encrypt & download"
        requireConfirm
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const confirmBtn = screen.getByRole('button', { name: 'Encrypt & download' });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/passphrase \(min/i), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByLabelText(/confirm passphrase/i), {
      target: { value: 'different' },
    });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/confirm passphrase/i), {
      target: { value: 'password123' },
    });
    expect(confirmBtn).toBeEnabled();

    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith('password123');
  });

  it('import mode needs only one password, and shows the error from the parent', () => {
    render(
      <BackupPasswordDialog
        title="Unlock backup"
        message="Enter the passphrase used when exporting"
        confirmLabel="Unlock"
        error="Wrong password or corrupted file"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const unlockBtn = screen.getByRole('button', { name: 'Unlock' });
    expect(unlockBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/passphrase/i), {
      target: { value: 'password123' },
    });
    expect(unlockBtn).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Wrong password or corrupted file');

    fireEvent.click(unlockBtn);
    expect(onConfirm).toHaveBeenCalledWith('password123');
  });

  it('dismisses on cancel', () => {
    render(
      <BackupPasswordDialog
        title="Encrypt backup"
        message="x"
        confirmLabel="OK"
        requireConfirm
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('ImportSummaryDialog', () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    onConfirm.mockClear();
    onCancel.mockClear();
  });

  it('defaults to merge and reports recognized/ignored counts', () => {
    render(
      <ImportSummaryDialog
        source="plain"
        recognizedCount={42}
        ignored={['oldKey']}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText(/42 recognized settings/)).toBeInTheDocument();
    expect(screen.getByText(/1 unknown key ignored: oldKey/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Merge & import' }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('exact restore when the replace toggle is on', () => {
    render(
      <ImportSummaryDialog
        source="encrypted"
        recognizedCount={3}
        ignored={[]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Replace all current settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace & import' }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });
});
