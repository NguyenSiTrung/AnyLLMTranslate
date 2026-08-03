import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BackupPasswordDialog, ExportFormatDialog, ImportSummaryDialog } from '../BackupDialogs';

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

  it('shows a live strength hint in export mode but not in import mode', () => {
    const { unmount } = render(
      <BackupPasswordDialog
        title="Encrypt backup"
        message="x"
        confirmLabel="OK"
        requireConfirm
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const field = screen.getByLabelText(/passphrase \(min/i);
    expect(screen.queryByText(/strength:/i)).not.toBeInTheDocument();

    fireEvent.change(field, { target: { value: 'abc' } });
    expect(screen.getByText('Strength: Weak')).toBeInTheDocument();

    fireEvent.change(field, { target: { value: 'abcd1234' } });
    expect(screen.getByText('Strength: Fair')).toBeInTheDocument();

    fireEvent.change(field, { target: { value: 'Abcdefg12345' } });
    expect(screen.getByText('Strength: Strong')).toBeInTheDocument();

    // Import mode never surfaces the strength hint.
    unmount();
    render(
      <BackupPasswordDialog
        title="Unlock backup"
        message="x"
        confirmLabel="Unlock"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.change(screen.getByLabelText('Passphrase'), {
      target: { value: 'Abcdefg12345' },
    });
    expect(screen.queryByText(/strength:/i)).not.toBeInTheDocument();
  });

  it('passphrase field can be revealed via the built-in show/hide toggle', () => {
    render(
      <BackupPasswordDialog
        title="Unlock backup"
        message="x"
        confirmLabel="Unlock"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const field = screen.getByLabelText('Passphrase') as HTMLInputElement;
    expect(field.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(field.type).toBe('password');
  });
});

describe('ImportSummaryDialog', () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    onConfirm.mockClear();
    onCancel.mockClear();
  });

  it('defaults to merge, reports recognized/ignored counts, and hides both lists when empty', () => {
    const { unmount } = render(
      <ImportSummaryDialog
        source="plain"
        recognizedCount={42}
        ignored={['oldKey']}
        mergeImpact={{ changed: [], resetToDefaults: [] }}
        replaceImpact={{ changed: [], resetToDefaults: [] }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText(/42 recognized settings/)).toBeInTheDocument();
    expect(screen.getByText(/1 unknown key ignored: oldKey/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Merge & import' }));
    expect(onConfirm).toHaveBeenCalledWith(false);

    // Empty impacts hide both the overwrite and reset-to-defaults lists.
    unmount();
    render(
      <ImportSummaryDialog
        source="plain"
        recognizedCount={0}
        ignored={[]}
        mergeImpact={{ changed: [], resetToDefaults: [] }}
        replaceImpact={{ changed: [], resetToDefaults: [] }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.queryByText(/will be overwritten/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reset to defaults/i)).not.toBeInTheDocument();
  });

  it('exact restore when the replace toggle is on', () => {
    render(
      <ImportSummaryDialog
        source="encrypted"
        recognizedCount={3}
        ignored={[]}
        mergeImpact={{ changed: [], resetToDefaults: [] }}
        replaceImpact={{ changed: [], resetToDefaults: [] }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Replace all current settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace & import' }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('shows the overwrite list in merge mode by default and reveals reset-to-defaults only when replace is toggled on', () => {
    render(
      <ImportSummaryDialog
        source="plain"
        recognizedCount={1}
        ignored={[]}
        mergeImpact={{ changed: ['targetLanguage'], resetToDefaults: [] }}
        replaceImpact={{ changed: ['targetLanguage'], resetToDefaults: ['theme', 'glossary'] }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText(/1 setting will be overwritten/i)).toBeInTheDocument();
    expect(screen.getByText('targetLanguage')).toBeInTheDocument();
    expect(screen.queryByText(/reset to defaults/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Replace all current settings' }));
    expect(
      screen.getByText(/2 customized settings not in the file will reset to defaults/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/theme/)).toBeInTheDocument();
    expect(screen.getByText(/glossary/)).toBeInTheDocument();
  });
});

describe('ExportFormatDialog', () => {
  const onSelect = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    onSelect.mockClear();
    onCancel.mockClear();
  });

  it('pre-selects encrypted (recommended) by default and continues with the selected format', () => {
    const { unmount } = render(
      <ExportFormatDialog hasApiKeys={false} onSelect={onSelect} onCancel={onCancel} />,
    );

    const encrypted = screen.getByRole('radio', { name: /encrypted backup/i });
    expect(encrypted).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /plain json/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSelect).toHaveBeenCalledWith('encrypted');

    // Switching to Plain JSON changes what Continue submits.
    onSelect.mockClear();
    unmount();
    render(<ExportFormatDialog hasApiKeys onSelect={onSelect} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('radio', { name: /plain json/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSelect).toHaveBeenCalledWith('plain');
  });

  it('warns about cleartext keys on Plain JSON only when keys exist', () => {
    const { rerender } = render(
      <ExportFormatDialog hasApiKeys={false} onSelect={onSelect} onCancel={onCancel} />,
    );
    expect(screen.queryByText(/cleartext/i)).not.toBeInTheDocument();

    rerender(<ExportFormatDialog hasApiKeys onSelect={onSelect} onCancel={onCancel} />);
    expect(
      screen.getByText(/will contain your api keys in cleartext/i),
    ).toBeInTheDocument();
  });

  it('supports arrow-key navigation and closes on Escape and Cancel', () => {
    render(<ExportFormatDialog hasApiKeys={false} onSelect={onSelect} onCancel={onCancel} />);
    const group = screen.getByRole('radiogroup', { name: 'Export format' });

    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(screen.getByRole('radio', { name: /plain json/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.keyDown(group, { key: 'ArrowUp' });
    expect(screen.getByRole('radio', { name: /encrypted backup/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    onCancel.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
