/**
 * Scientific PDF setup wizard — Docker one-liner, health poll, connection test.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  FlaskConical,
  Loader2,
  Server,
  Shield,
  Terminal,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  mergeScientificPdfSettings,
  scientificPdfSetupCommands,
  shouldWarnNonLoopbackServerUrl,
  DEFAULT_SCIENTIFIC_PDF_PORT,
} from '@/lib/scientificPdf';
import {
  initialScientificPdfWizardState,
  reduceScientificPdfWizard,
  resolveScientificPdfWizardEntry,
  scientificPdfSetupCompletedAt,
  scientificPdfWizardStepIndex,
  SCIENTIFIC_PDF_WIZARD_STEPS,
  SCIENTIFIC_PDF_WIZARD_STEP_LABELS,
  type ScientificPdfWizardState,
} from '@/lib/scientificPdfWizard';
import { Button } from '@/ui/Button';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Badge } from '@/ui/Badge';
import { useToast } from '@/ui/ToastProvider';

interface ScientificPdfWizardProps {
  open: boolean;
  onClose: () => void;
}

export function ScientificPdfWizard({ open, onClose }: ScientificPdfWizardProps) {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const { success: showSuccess, error: showError } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [wizard, setWizard] = useState<ScientificPdfWizardState>(() =>
    initialScientificPdfWizardState(),
  );
  const [polling, setPolling] = useState(false);
  const [testing, setTesting] = useState(false);
  const sci = mergeScientificPdfSettings(settings.scientificPdf);
  const [serverUrlDraft, setServerUrlDraft] = useState(sci.serverUrl);
  const setupCommands = scientificPdfSetupCommands(DEFAULT_SCIENTIFIC_PDF_PORT);
  const nonLoopback = shouldWarnNonLoopbackServerUrl(serverUrlDraft);

  // Reset entry step when dialog opens
  useEffect(() => {
    if (!open) return;
    const entry = resolveScientificPdfWizardEntry({
      setupCompletedAt: sci.setupCompletedAt,
      enabled: sci.enabled,
    });
    setWizard(initialScientificPdfWizardState(entry));
    setServerUrlDraft(mergeScientificPdfSettings(settings.scientificPdf).serverUrl);
    setPolling(false);
    setTesting(false);
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => dialogRef.current?.focus(), 50);
    return () => {
      document.body.style.overflow = '';
      window.clearTimeout(t);
    };
    // Only re-run when open flips true (intentional open gate).
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const persistServerUrl = useCallback(() => {
    updateSettings({
      scientificPdf: {
        ...mergeScientificPdfSettings(settings.scientificPdf),
        serverUrl: serverUrlDraft.trim() || sci.serverUrl,
      },
    });
  }, [updateSettings, settings.scientificPdf, serverUrlDraft, sci.serverUrl]);

  const dispatch = useCallback(
    (event: Parameters<typeof reduceScientificPdfWizard>[1]) => {
      setWizard((prev) => reduceScientificPdfWizard(prev, event));
    },
    [],
  );

  const pollHealth = useCallback(async () => {
    persistServerUrl();
    setPolling(true);
    try {
      const res = (await chrome.runtime.sendMessage({
        action: 'SCIENTIFIC_PDF_HEALTH',
        serverUrl: serverUrlDraft.trim() || undefined,
      })) as { success?: boolean; status?: string; error?: string };
      if (res?.success && res.status === 'ok') {
        dispatch({ type: 'HEALTH_OK' });
        showSuccess('Bridge is reachable');
      } else {
        dispatch({ type: 'HEALTH_FAIL' });
        showError(res?.error ?? 'Server offline');
      }
    } catch (err) {
      dispatch({ type: 'HEALTH_FAIL' });
      showError(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setPolling(false);
    }
  }, [persistServerUrl, serverUrlDraft, dispatch, showSuccess, showError]);

  const runTest = useCallback(async () => {
    setTesting(true);
    try {
      const res = (await chrome.runtime.sendMessage({
        action: 'SCIENTIFIC_PDF_HEALTH',
        serverUrl: serverUrlDraft.trim() || undefined,
      })) as { success?: boolean; status?: string; error?: string };
      if (res?.success && res.status === 'ok') {
        dispatch({ type: 'TEST_OK' });
        const completedAt = scientificPdfSetupCompletedAt();
        updateSettings({
          scientificPdf: {
            ...mergeScientificPdfSettings(settings.scientificPdf),
            enabled: true,
            serverUrl: serverUrlDraft.trim() || sci.serverUrl,
            setupCompletedAt: completedAt,
          },
        });
        showSuccess('Scientific PDF setup complete');
      } else {
        dispatch({ type: 'TEST_FAIL' });
        showError(res?.error ?? 'Connection test failed');
      }
    } catch (err) {
      dispatch({ type: 'TEST_FAIL' });
      showError(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setTesting(false);
    }
  }, [
    serverUrlDraft,
    dispatch,
    updateSettings,
    settings.scientificPdf,
    sci.serverUrl,
    showSuccess,
    showError,
  ]);

  const copyText = useCallback(
    async (text: string, label = 'Command') => {
      try {
        await navigator.clipboard.writeText(text);
        showSuccess(`${label} copied`);
      } catch {
        showError('Could not copy — select the command manually');
      }
    },
    [showSuccess, showError],
  );

  const finish = useCallback(() => {
    if (wizard.completed || wizard.step === 'done') {
      const completedAt =
        mergeScientificPdfSettings(settings.scientificPdf).setupCompletedAt ??
        scientificPdfSetupCompletedAt();
      updateSettings({
        scientificPdf: {
          ...mergeScientificPdfSettings(settings.scientificPdf),
          enabled: true,
          serverUrl: serverUrlDraft.trim() || sci.serverUrl,
          setupCompletedAt: completedAt,
        },
      });
    }
    onClose();
  }, [
    wizard.completed,
    wizard.step,
    settings.scientificPdf,
    updateSettings,
    serverUrlDraft,
    sci.serverUrl,
    onClose,
  ]);

  if (!open) return null;

  const stepIndex = scientificPdfWizardStepIndex(wizard.step);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl outline-none"
      >
        <header className="border-b border-white/10 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={titleId} className="text-base font-semibold text-zinc-50">
                Set up Scientific PDF
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Layout-preserving translation via a local Docker bridge (pdf2zh).
              </p>
            </div>
            <Badge variant="experimental">Optional</Badge>
          </div>
          <ol className="mt-4 flex flex-wrap gap-1.5" aria-label="Wizard steps">
            {SCIENTIFIC_PDF_WIZARD_STEPS.map((s, i) => {
              const active = s === wizard.step;
              const done = i + 1 < stepIndex;
              return (
                <li
                  key={s}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    active
                      ? 'bg-amber-500/20 text-amber-200'
                      : done
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {i + 1}. {SCIENTIFIC_PDF_WIZARD_STEP_LABELS[s]}
                </li>
              );
            })}
          </ol>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-zinc-300">
          {wizard.step === 'intro' && (
            <div className="space-y-3">
              <p>
                PDF translation keeps equations and layout using a{' '}
                <strong className="text-zinc-100">local</strong> Docker bridge (pdf2zh).
                Your PDF and short-lived API credentials are sent only to the server URL you
                configure (default: loopback).
              </p>
              <ul className="list-inside list-disc space-y-1 text-xs text-zinc-400">
                <li>Uses the same provider pool as normal translation (no second API key).</li>
                <li>PDF Translate is unavailable until this bridge is Ready.</li>
                <li>Requires Docker Desktop (or Docker Engine) installed by you.</li>
              </ul>
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100/90">
                <Shield className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  Privacy: the full PDF and provider credentials leave the browser only when you
                  start a Scientific job against your chosen server URL.
                </span>
              </div>
            </div>
          )}

          {wizard.step === 'install' && (
            <div className="space-y-4">
              <p className="text-xs text-zinc-400">
                Install <strong className="text-zinc-200">Docker Desktop</strong> (or Docker Engine),
                then open a terminal in the <strong className="text-zinc-200">AnyLLMTranslate
                repo root</strong> and run the commands below in order.
              </p>
              {setupCommands.map((item) => (
                <div key={item.title} className="space-y-1.5">
                  <p className="text-xs font-medium text-zinc-200">{item.title}</p>
                  <p className="text-[11px] text-zinc-500">{item.hint}</p>
                  <div className="relative rounded-lg border border-zinc-700 bg-zinc-900 p-3 font-mono text-[11px] text-zinc-200">
                    <pre className="whitespace-pre-wrap break-all pr-10">{item.command}</pre>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-2"
                      onClick={() => void copyText(item.command, item.title)}
                      aria-label={`Copy ${item.title}`}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <FieldGroup
                label="Bridge server URL"
                description="Default is loopback. Non-loopback hosts receive your PDF and API keys."
                htmlFor="sci-pdf-server-url"
              >
                <Input
                  id="sci-pdf-server-url"
                  value={serverUrlDraft}
                  onChange={(e) => setServerUrlDraft(e.target.value)}
                  onBlur={persistServerUrl}
                  placeholder={`http://127.0.0.1:${DEFAULT_SCIENTIFIC_PDF_PORT}`}
                />
              </FieldGroup>
              {nonLoopback && (
                <p className="text-xs text-rose-300" role="status">
                  Warning: this URL is not loopback. Confirm you trust this host before using
                  Scientific mode.
                </p>
              )}
              <p className="flex items-start gap-1.5 text-[11px] text-zinc-500">
                <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  Full guide: <code className="rounded bg-zinc-800 px-1">docs/scientific-pdf-setup.md</code>
                  . Rebuild only when bridge code/Dockerfile changes (see guide). Progress UI in the
                  PDF viewer does <strong className="text-zinc-400">not</strong> require a Docker rebuild.
                </span>
              </p>
            </div>
          )}

          {wizard.step === 'poll' && (
            <div className="space-y-3">
              <p className="flex items-start gap-2 text-xs text-zinc-400">
                <Server className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Start the container, then check health at{' '}
                <code className="rounded bg-zinc-800 px-1 text-zinc-200">
                  {serverUrlDraft || sci.serverUrl}
                </code>
              </p>
              {wizard.lastError && (
                <p className="text-xs text-rose-300" role="alert">
                  {wizard.lastError}
                  {wizard.healthFailCount > 1
                    ? ` (${wizard.healthFailCount} attempts)`
                    : ''}
                </p>
              )}
              <Button
                type="button"
                onClick={() => void pollHealth()}
                disabled={polling}
                className="w-full"
              >
                {polling ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking…
                  </>
                ) : (
                  'Check health'
                )}
              </Button>
            </div>
          )}

          {wizard.step === 'test' && (
            <div className="space-y-3">
              <p className="flex items-start gap-2 text-xs text-zinc-400">
                <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Optional connection test (same as health). Marks setup complete and enables
                Scientific mode.
              </p>
              {wizard.lastError && (
                <p className="text-xs text-rose-300" role="alert">
                  {wizard.lastError}
                </p>
              )}
              <Button
                type="button"
                onClick={() => void runTest()}
                disabled={testing}
                className="w-full"
              >
                {testing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing…
                  </>
                ) : (
                  'Test connection'
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  dispatch({ type: 'NEXT' });
                  updateSettings({
                    scientificPdf: {
                      ...mergeScientificPdfSettings(settings.scientificPdf),
                      enabled: true,
                      serverUrl: serverUrlDraft.trim() || sci.serverUrl,
                      setupCompletedAt: scientificPdfSetupCompletedAt(),
                    },
                  });
                }}
              >
                Skip test — finish with health only
              </Button>
            </div>
          )}

          {wizard.step === 'done' && (
            <div className="space-y-3 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" aria-hidden />
              <p className="font-medium text-zinc-100">Scientific PDF is ready</p>
              <p className="text-xs text-zinc-500">
                Open a PDF in the built-in viewer and choose <strong>Scientific</strong> layout
                mode. Fast mode remains available anytime.
              </p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-white/10 px-5 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <div className="flex gap-2">
            {wizard.step !== 'intro' && wizard.step !== 'done' && (
              <Button type="button" variant="ghost" onClick={() => dispatch({ type: 'BACK' })}>
                Back
              </Button>
            )}
            {wizard.step === 'intro' && (
              <Button type="button" onClick={() => dispatch({ type: 'NEXT' })}>
                Continue
              </Button>
            )}
            {wizard.step === 'install' && (
              <Button
                type="button"
                onClick={() => {
                  persistServerUrl();
                  dispatch({ type: 'NEXT' });
                }}
              >
                I ran Docker
              </Button>
            )}
            {wizard.step === 'done' && (
              <Button type="button" onClick={finish}>
                Done
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
