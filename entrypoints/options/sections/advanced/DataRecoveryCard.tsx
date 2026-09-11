/**
 * DataRecoveryCard — export/import/restore workflows extracted from the
 * monolithic AdvancedSection. Owns every backup dialog and the pre-import
 * snapshot lifecycle. Semantics preserved exactly: parse/decrypt only sets
 * importMeta; the snapshot is saved before merge or replace; failed parse,
 * decryption, or snapshot load never replaces current settings.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { extractSettings, useSettingsStore } from '@/stores/settingsStore';
import { useToast } from '@/ui/ToastProvider';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import {
  BackupDecryptError,
  computeImportImpact,
  decryptBackup,
  detectFormat,
  encryptBackup,
  pickKnownSettings,
  sanitizeImportObject,
  serializeSettings,
  type ImportImpact,
} from '@/lib/backup';
import {
  clearPreImportSnapshot,
  loadPreImportSnapshot,
  savePreImportSnapshot,
} from '@/lib/config';
import {
  BackupPasswordDialog,
  ExportFormatDialog,
  ImportSummaryDialog,
} from '@/entrypoints/options/components/BackupDialogs';

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface ImportState {
  recognized: Record<string, unknown>;
  ignored: string[];
  source: 'plain' | 'encrypted';
  mergeImpact: ImportImpact;
  replaceImpact: ImportImpact;
}

export function DataRecoveryCard() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const replaceSettings = useSettingsStore((s) => s.replaceSettings);
  const restoreSettings = useSettingsStore((s) => s.restoreSettings);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { success: showSuccess, error: showError, successWithAction } = useToast();
  const [showExportChooser, setShowExportChooser] = useState(false);
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [showImportPassword, setShowImportPassword] = useState(false);
  const [pendingEncryptedText, setPendingEncryptedText] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importMeta, setImportMeta] = useState<ImportState | null>(null);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);

  const hasApiKeys =
    Boolean(settings.provider?.apiKey) ||
    (settings.providers ?? []).some((p) => (p.keys ?? []).some((k) => Boolean(k.apiKey)));

  // Show the persistent restore button when a pre-import snapshot exists.
  useEffect(() => {
    void loadPreImportSnapshot()
      .then((snap) => setHasSnapshot(snap !== null))
      .catch(() => setHasSnapshot(false));
  }, []);

  const handleExportPlain = useCallback(() => {
    const full = extractSettings(settings);
    const blob = new Blob([serializeSettings(full)], { type: 'application/json' });
    downloadBlob(
      blob,
      `anyllm-translate-settings-${new Date().toISOString().slice(0, 10)}.json`,
    );
    // Cleartext-keys warning lives in the export chooser (before download),
    // so a successful export always gets a success toast.
    showSuccess('Settings exported successfully');
  }, [settings, showSuccess]);

  const handleExportEncrypted = useCallback(
    async (password: string) => {
      setPasswordBusy(true);
      setPasswordError(null);
      try {
        const full = extractSettings(settings);
        const envelope = await encryptBackup(full, password);
        downloadBlob(
          new Blob([envelope], { type: 'application/json' }),
          `anyllm-translate-backup-${new Date().toISOString().slice(0, 10)}.json`,
        );
        setShowExportPassword(false);
        showSuccess('Encrypted backup exported — keep the passphrase safe!');
      } catch {
        setPasswordError('Encryption failed — try again.');
      } finally {
        setPasswordBusy(false);
      }
    },
    [settings, showSuccess],
  );

  const handleImportFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        if (detectFormat(text) === 'encrypted') {
          setPendingEncryptedText(text);
          setPasswordError(null);
          setShowImportPassword(true);
          return;
        }
        const { recognized, ignored } = sanitizeImportObject(JSON.parse(text));
        const current = pickKnownSettings(useSettingsStore.getState());
        setImportMeta({
          recognized,
          ignored,
          source: 'plain',
          mergeImpact: computeImportImpact(current, recognized, 'merge'),
          replaceImpact: computeImportImpact(current, recognized, 'replace'),
        });
      } catch {
        showError('Failed to import settings. Invalid JSON file.');
      }
    },
    [showError],
  );

  const handleImportPassword = useCallback(
    async (password: string) => {
      if (!pendingEncryptedText) return;
      setPasswordBusy(true);
      setPasswordError(null);
      try {
        const decrypted = await decryptBackup(pendingEncryptedText, password);
        const { recognized, ignored } = sanitizeImportObject(decrypted);
        const current = pickKnownSettings(useSettingsStore.getState());
        setShowImportPassword(false);
        setPendingEncryptedText(null);
        setImportMeta({
          recognized,
          ignored,
          source: 'encrypted',
          mergeImpact: computeImportImpact(current, recognized, 'merge'),
          replaceImpact: computeImportImpact(current, recognized, 'replace'),
        });
      } catch (err) {
        setPasswordError(
          err instanceof BackupDecryptError
            ? err.message
            : 'Wrong password or corrupted file',
        );
      } finally {
        setPasswordBusy(false);
      }
    },
    [pendingEncryptedText],
  );

  const handleRestoreSnapshot = useCallback(async () => {
    setShowRestoreModal(false);
    setImportBusy(true);
    try {
      const snapshot = await loadPreImportSnapshot();
      if (!snapshot) {
        setHasSnapshot(false);
        showError('No previous settings to restore.');
        return;
      }
      await restoreSettings(snapshot);
      await clearPreImportSnapshot();
      setHasSnapshot(false);
      showSuccess('Previous settings restored.');
    } catch {
      await clearPreImportSnapshot().catch(() => {});
      setHasSnapshot(false);
      showError('Failed to restore previous settings.');
    } finally {
      setImportBusy(false);
    }
  }, [restoreSettings, showSuccess, showError]);

  const handleImportApply = useCallback(
    async (replaceAll: boolean) => {
      if (!importMeta || importBusy) return;
      setImportBusy(true);
      try {
        // Best-effort snapshot: import proceeds even if saving it fails.
        try {
          await savePreImportSnapshot(pickKnownSettings(useSettingsStore.getState()));
        } catch {
          // Snapshot unavailable — import still applies, no Undo action.
        }
        if (replaceAll) {
          await replaceSettings(importMeta.recognized);
        } else {
          await updateSettings(importMeta.recognized);
        }
        // Re-read storage so the toast Undo and the persistent button agree.
        const snapshotNow = await loadPreImportSnapshot();
        setHasSnapshot(snapshotNow !== null);
        const message =
          importMeta.ignored.length > 0
            ? `Imported ${Object.keys(importMeta.recognized).length} settings; ignored ${importMeta.ignored.length} unknown key(s): ${importMeta.ignored.join(', ')}`
            : 'Settings imported successfully!';
        if (snapshotNow) {
          successWithAction(message, {
            label: 'Undo import',
            onClick: () => void handleRestoreSnapshot(),
          });
        } else {
          showSuccess(message);
        }
      } catch {
        showError('Failed to import settings.');
      } finally {
        setImportBusy(false);
        setImportMeta(null);
      }
    },
    [
      importMeta,
      importBusy,
      replaceSettings,
      updateSettings,
      showSuccess,
      showError,
      successWithAction,
      handleRestoreSnapshot,
    ],
  );

  return (
    <>
      <Card
        variant="bordered"
        title="Data and recovery"
        description="Back up, import, or restore your settings."
        icon={<Database className="w-3.5 h-3.5" />}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.03]">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/25 bg-blue-500/10 text-blue-400">
              <Download className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-zinc-100">Export settings</p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                Download a JSON backup of providers, rules, glossary, and preferences.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                id="export-settings-btn"
                variant="primary"
                size="sm"
                onClick={() => setShowExportChooser(true)}
                icon={<Download className="w-3.5 h-3.5" />}
              >
                Export backup
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.03]">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
              <Upload className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-zinc-100">Import settings</p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                Restore a plain JSON export or a password-encrypted backup. Choose merge or
                exact replace before applying.
              </p>
            </div>
            <Button
              id="import-settings-btn"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              icon={<Upload className="w-3.5 h-3.5" />}
              className="w-full sm:w-auto"
            >
              Import backup
            </Button>
            {hasSnapshot && (
              <Button
                id="restore-previous-settings-btn"
                variant="ghost"
                size="sm"
                onClick={() => setShowRestoreModal(true)}
                icon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                Restore previous settings
              </Button>
            )}
            <input
              ref={fileInputRef}
              data-testid="import-settings-file"
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportFile(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <div
          className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${
            hasApiKeys
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              : 'border-zinc-800 bg-zinc-900/40 text-zinc-500'
          }`}
        >
          {hasApiKeys ? (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden="true" />
          )}
          <span>
            {hasApiKeys
              ? 'A plain JSON export includes ALL your API keys in cleartext. Treat the file as a secret — choose Encrypted backup in the export dialog to move keys safely between devices.'
              : 'Plain JSON exports include provider configuration. Once API keys are added, they appear in cleartext — choose Encrypted backup in the export dialog when moving devices.'}
          </span>
        </div>
      </Card>

      {/* Export Format Chooser Modal */}
      {showExportChooser && (
        <ExportFormatDialog
          hasApiKeys={hasApiKeys}
          onSelect={(format) => {
            setShowExportChooser(false);
            if (format === 'encrypted') {
              setShowExportPassword(true);
            } else {
              handleExportPlain();
            }
          }}
          onCancel={() => setShowExportChooser(false)}
        />
      )}

      {/* Encrypted Export Password Modal */}
      {showExportPassword && (
        <BackupPasswordDialog
          title="Encrypt backup"
          message={
            <p>
              The file is encrypted with your passphrase (PBKDF2 + AES-256-GCM). Anyone with the
              file and this passphrase can restore it on any device. If you forget the passphrase,
              the backup is unrecoverable.
            </p>
          }
          confirmLabel="Encrypt & download"
          requireConfirm
          error={passwordError}
          busy={passwordBusy}
          onConfirm={(password) => void handleExportEncrypted(password)}
          onCancel={() => {
            setShowExportPassword(false);
            setPasswordError(null);
          }}
        />
      )}

      {/* Encrypted Import Password Modal */}
      {showImportPassword && (
        <BackupPasswordDialog
          title="Unlock backup"
          message="Enter the passphrase that was used when this backup was exported."
          confirmLabel="Unlock"
          error={passwordError}
          busy={passwordBusy}
          onConfirm={(password) => void handleImportPassword(password)}
          onCancel={() => {
            setShowImportPassword(false);
            setPendingEncryptedText(null);
            setPasswordError(null);
          }}
        />
      )}

      {/* Import Summary Modal */}
      {importMeta && (
        <ImportSummaryDialog
          source={importMeta.source}
          recognizedCount={Object.keys(importMeta.recognized).length}
          ignored={importMeta.ignored}
          mergeImpact={importMeta.mergeImpact}
          replaceImpact={importMeta.replaceImpact}
          busy={importBusy}
          onConfirm={(replaceAll) => void handleImportApply(replaceAll)}
          onCancel={() => setImportMeta(null)}
        />
      )}

      {/* Restore Previous Settings Confirmation Modal */}
      {showRestoreModal && (
        <Modal
          title="Restore previous settings?"
          message="Replaces your current settings with the state before your last import. After this, the saved snapshot is consumed."
          variant="danger"
          confirmLabel="Restore"
          cancelLabel="Keep current"
          onConfirm={() => void handleRestoreSnapshot()}
          onCancel={() => setShowRestoreModal(false)}
        />
      )}
    </>
  );
}
