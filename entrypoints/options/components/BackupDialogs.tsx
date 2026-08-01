/**
 * Password + import-summary dialogs for Data Portability backups.
 * Modelled on ui/Modal's visuals, but with form controls — ui/Modal's
 * onConfirm cannot carry input values.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Braces, Download, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Toggle } from '@/ui/Toggle';
import { passphraseStrength, type PassphraseStrength } from '@/lib/passphraseStrength';

const STRENGTH_META: Record<
  PassphraseStrength,
  { label: string; width: string; bar: string; text: string }
> = {
  weak: { label: 'Weak', width: '33%', bar: 'bg-rose-500', text: 'text-rose-400/90' },
  fair: { label: 'Fair', width: '66%', bar: 'bg-amber-500', text: 'text-amber-400/90' },
  strong: { label: 'Strong', width: '100%', bar: 'bg-emerald-500', text: 'text-emerald-400/90' },
};

interface BackupPasswordDialogProps {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  /** When true, require a matching confirm field (export). Single field for import. */
  requireConfirm?: boolean;
  /** Inline error shown above the actions (e.g. wrong password). */
  error?: string | null;
  busy?: boolean;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}

export function BackupPasswordDialog({
  title,
  message,
  confirmLabel,
  requireConfirm = false,
  error = null,
  busy = false,
  onConfirm,
  onCancel,
}: BackupPasswordDialogProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(
      () => (dialogRef.current?.querySelector('input') as HTMLInputElement | null)?.focus(),
      50,
    );
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      window.clearTimeout(t);
    };
  }, []);

  const mismatch = requireConfirm && confirm.length > 0 && confirm !== password;
  const canSubmit =
    password.length >= 8 &&
    (!requireConfirm || (confirm.length > 0 && confirm === password));
  const strength =
    requireConfirm && password.length > 0 ? passphraseStrength(password) : null;

  const submit = () => {
    if (!canSubmit || busy) return;
    onConfirm(password);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div
        ref={dialogRef}
        className="relative w-full max-w-md mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl animate-[scaleIn_200ms_ease-out] overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/15">
              <KeyRound className="w-4 h-4 text-blue-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
              <div className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{message}</div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="backup-password" className="text-xs font-medium text-zinc-400">
                Passphrase{requireConfirm ? ' (min 8 characters)' : ''}
              </label>
              <Input
                id="backup-password"
                aria-label="Passphrase"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter passphrase"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSubmit && !busy) submit();
                }}
              />
            </div>
            {strength && (
              <div aria-live="polite">
                <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${STRENGTH_META[strength].bar}`}
                    style={{ width: STRENGTH_META[strength].width }}
                  />
                </div>
                <p className={`mt-1 text-[11px] font-medium ${STRENGTH_META[strength].text}`}>
                  Strength: {STRENGTH_META[strength].label}
                </p>
              </div>
            )}
            {requireConfirm && (
              <div>
                <label htmlFor="backup-password-confirm" className="text-xs font-medium text-zinc-400">
                  Confirm passphrase
                </label>
                <Input
                  id="backup-password-confirm"
                  aria-label="Confirm passphrase"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat passphrase"
                  error={mismatch ? 'Passphrases do not match' : undefined}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canSubmit && !busy) submit();
                  }}
                />
              </div>
            )}
            {password.length > 0 && password.length < 8 && (
              <p className="text-xs text-amber-400/90">Use at least 8 characters.</p>
            )}
            {error && (
              <p
                className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={submit}
              disabled={!canSubmit || busy}
              loading={busy}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ImportSummaryDialogProps {
  source: 'plain' | 'encrypted';
  recognizedCount: number;
  ignored: string[];
  busy?: boolean;
  onConfirm: (replaceAll: boolean) => void;
  onCancel: () => void;
}

export function ImportSummaryDialog({
  source,
  recognizedCount,
  ignored,
  busy = false,
  onConfirm,
  onCancel,
}: ImportSummaryDialogProps) {
  const [replaceAll, setReplaceAll] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Import settings"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div
        ref={dialogRef}
        className="relative w-full max-w-md mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl animate-[scaleIn_200ms_ease-out] overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/15">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-zinc-100">Import settings</h3>
              <div className="text-sm text-zinc-400 mt-1.5 leading-relaxed">
                {source === 'encrypted'
                  ? 'Encrypted backup decrypted successfully. Review what will be applied.'
                  : 'Review what will be applied from this file.'}
              </div>
            </div>
          </div>

          <ul className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-xs text-zinc-400">
            <li className="flex gap-2">
              <span className="text-emerald-400/70">•</span>
              {recognizedCount} recognized setting{recognizedCount === 1 ? '' : 's'}
              {source === 'encrypted' ? ' (decrypted backup)' : ''}
            </li>
            {ignored.length > 0 ? (
              <li className="flex gap-2">
                <span className="text-amber-400/80">•</span>
                {ignored.length} unknown key{ignored.length === 1 ? '' : 's'} ignored:{' '}
                {ignored.join(', ')}
              </li>
            ) : (
              <li className="flex gap-2">
                <span className="text-zinc-600">•</span>
                No unknown keys
              </li>
            )}
          </ul>

          <div className="mt-4">
            <Toggle
              id="import-replace-toggle"
              checked={replaceAll}
              onChange={setReplaceAll}
              label="Replace all current settings"
              description={
                replaceAll
                  ? 'Everything not in the file resets to defaults — exact restore.'
                  : 'Merge: only the settings in the file are applied; everything else stays.'
              }
            />
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onConfirm(replaceAll)}
              disabled={busy}
              loading={busy}
            >
              {replaceAll ? 'Replace & import' : 'Merge & import'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

type ExportFormat = 'plain' | 'encrypted';

const FORMAT_ORDER: ExportFormat[] = ['encrypted', 'plain'];

export interface ExportFormatDialogProps {
  /** When true, the Plain JSON option shows an inline cleartext API-key warning. */
  hasApiKeys: boolean;
  onSelect: (format: ExportFormat) => void;
  onCancel: () => void;
}

/**
 * Format chooser shown before any export download. Encrypted backup is
 * pre-selected and badged Recommended; Plain JSON carries an inline
 * cleartext-keys warning (when keys exist) so the user is warned BEFORE
 * the file is written, not after.
 */
export function ExportFormatDialog({
  hasApiKeys,
  onSelect,
  onCancel,
}: ExportFormatDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('encrypted');
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(
      () =>
        (
          dialogRef.current?.querySelector('[aria-checked="true"]') as HTMLElement | null
        )?.focus(),
      50,
    );
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      window.clearTimeout(t);
    };
  }, []);

  const moveSelection = (delta: number) => {
    const idx = FORMAT_ORDER.indexOf(format);
    const next =
      FORMAT_ORDER[(idx + delta + FORMAT_ORDER.length) % FORMAT_ORDER.length];
    setFormat(next);
    (
      dialogRef.current?.querySelector(`[data-format="${next}"]`) as HTMLElement | null
    )?.focus();
  };

  const optionClass = (active: boolean) =>
    `flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 ${
      active
        ? 'border-cyan-500/50 bg-cyan-500/[0.08]'
        : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
    }`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Export settings"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div
        ref={dialogRef}
        className="relative w-full max-w-md mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl animate-[scaleIn_200ms_ease-out] overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/15">
              <Download className="w-4 h-4 text-blue-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-zinc-100">Export settings</h3>
              <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">
                Choose a format. Encrypted is recommended when the file will leave this
                device.
              </p>
            </div>
          </div>

          <div
            role="radiogroup"
            aria-label="Export format"
            className="space-y-2"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                e.preventDefault();
                moveSelection(1);
              }
              if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault();
                moveSelection(-1);
              }
            }}
          >
            <button
              type="button"
              role="radio"
              aria-checked={format === 'encrypted'}
              data-format="encrypted"
              onClick={() => setFormat('encrypted')}
              className={optionClass(format === 'encrypted')}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-500/25 bg-cyan-500/10 text-cyan-400">
                <Lock className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-100">Encrypted backup</span>
                  <Badge variant="info">Recommended</Badge>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
                  Protected with a passphrase (PBKDF2 + AES-256-GCM). Best for moving to
                  another device.
                </span>
              </span>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={format === 'plain'}
              data-format="plain"
              onClick={() => setFormat('plain')}
              className={optionClass(format === 'plain')}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800/60 text-zinc-400">
                <Braces className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-sm font-medium text-zinc-100">Plain JSON</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
                  Readable file for inspection or editing.
                </span>
                {hasApiKeys && (
                  <span className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Will contain your API keys in cleartext — keep the file private.
                  </span>
                )}
              </span>
            </button>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => onSelect(format)}>
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
