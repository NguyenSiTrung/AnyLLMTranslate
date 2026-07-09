/**
 * First-run / resume setup wizard — provider, connection test, target language.
 * Full UX: labeled stepper, validation, focus trap, brand accents, language chips.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  CheckCircle2,
  Globe2,
  KeyRound,
  Languages,
  Loader2,
  Lock,
  Server,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { getCatalogEntryById } from '@/lib/openAiCompatibleCatalog';
import { syncProviderToPool } from '@/lib/config';
import type { ProviderConfig } from '@/types/config';
import { ProviderCatalogPicker, inferCatalogId } from './components/ProviderCatalogPicker';
import { ConnectionTestProgressList } from './components/ConnectionTestProgressList';
import { ModelPicker } from './components/ModelPicker';
import { getTargetLanguages } from '@/lib/languages';
import { testConnection } from '@/services/providerTester';
import type { ConnectionTestResult, ConnectionTestStep } from '@/services/providerTester';
import {
  getConnectionErrorMessage,
  getProviderReadiness,
  getProviderRecoveryMessage,
} from '@/lib/providerReadiness';
import {
  type TranslatePageResult,
  type WizardStep,
  WIZARD_STEP_LABELS,
  WIZARD_STEPS,
  getPopularTargetLanguages,
  providerPatchInvalidatesTest,
  resolveWizardEntryStep,
  wizardStepIndex,
} from '@/lib/setupWizard';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Select } from '@/ui/Select';
import { useToast } from '@/ui/ToastProvider';

interface SetupWizardProps {
  open: boolean;
  onClose: () => void;
  /** Attempt to start translation on a normal browser tab. */
  onTranslateCurrentPage?: () => Promise<TranslatePageResult>;
  /** Optional entry override (e.g. deep-link `?step=test`). */
  forceEntryStep?: WizardStep | null;
}

const POPULAR_LANGUAGES = getPopularTargetLanguages();
const TARGET_LANGUAGE_OPTIONS = getTargetLanguages().map((language) => ({
  value: language.code,
  label: language.nativeName,
}));

export function SetupWizard({
  open,
  onClose,
  onTranslateCurrentPage,
  forceEntryStep = null,
}: SetupWizardProps) {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const updateProvider = useSettingsStore((s) => s.updateProvider);
  const { error: showError, success: showSuccess } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [step, setStep] = useState<WizardStep>('welcome');
  const [selectedLanguage, setSelectedLanguage] = useState(settings.targetLanguage);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testProgress, setTestProgress] = useState<ConnectionTestStep[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  const clearTestState = useCallback(() => {
    setTestResult(null);
    setTestProgress([]);
  }, []);

  /**
   * Update the legacy provider mirror AND keep providers[0] in sync so the
   * pool coordinator (which reads settings.providers) sees wizard edits
   * immediately. The wizard's single-provider flow maps to pool[0].
   */
  const updateProviderAndPool = useCallback(
    (patch: Partial<ProviderConfig>) => {
      if (providerPatchInvalidatesTest(patch)) {
        clearTestState();
      }
      updateProvider(patch);
      updateSettings({
        providers: syncProviderToPool(settings.providers ?? [], patch),
      });
    },
    [updateProvider, updateSettings, settings.providers, clearTestState],
  );

  // Snapshot onboarding/language when dialog opens (avoid re-running mid-flow)
  const onboardingRef = useRef(settings.onboarding);
  const targetLanguageRef = useRef(settings.targetLanguage);
  const forceEntryRef = useRef(forceEntryStep);
  onboardingRef.current = settings.onboarding;
  targetLanguageRef.current = settings.targetLanguage;
  forceEntryRef.current = forceEntryStep;

  // Open: restore entry step, language, scroll lock, focus
  useEffect(() => {
    if (!open) return;

    const forced = forceEntryRef.current;
    const entry =
      forced && (WIZARD_STEPS as readonly string[]).includes(forced)
        ? forced
        : resolveWizardEntryStep(onboardingRef.current);
    setStep(entry);
    setSelectedLanguage(targetLanguageRef.current);
    setShowSkipConfirm(false);
    // Drop stale local test UI when reopening; connectionStatus still gates proceed
    setTestResult(null);
    setTestProgress([]);
    setIsTesting(false);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  // Focus trap + Escape
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (showSkipConfirm) {
          setShowSkipConfirm(false);
          return;
        }
        if (step === 'done' || settings.onboarding.completed) {
          onClose();
          return;
        }
        setShowSkipConfirm(true);
        return;
      }

      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, step, showSkipConfirm, settings.onboarding.completed, onClose]);

  if (!open) return null;

  const setWizardStep = async (nextStep: WizardStep) => {
    setStep(nextStep);
    await updateSettings({
      onboarding: {
        ...settings.onboarding,
        lastStep: nextStep,
      },
    });
  };

  const handleSkip = async () => {
    await updateSettings({
      onboarding: { completed: false, skipped: true, lastStep: step === 'done' ? 'language' : step },
    });
    setShowSkipConfirm(false);
    onClose();
  };

  const catalogId = inferCatalogId(settings.provider.baseUrl);
  const catalogEntry = getCatalogEntryById(catalogId);
  const apiKeyPlaceholder = catalogEntry?.placeholder ?? 'sk-...';
  const readiness = getProviderReadiness(settings.provider);
  const recovery = getProviderRecoveryMessage(readiness);
  const canContinueToTest = readiness.canTest;
  const canProceedPastTest =
    Boolean(testResult?.overall) || settings.provider.connectionStatus === 'success';

  const providerLabel =
    settings.provider.displayName?.trim() ||
    catalogEntry?.displayName ||
    'Custom endpoint';
  const modelLabel = settings.provider.model?.trim() || '—';
  const targetLangLabel =
    getTargetLanguages().find((l) => l.code === settings.targetLanguage)?.nativeName ??
    settings.targetLanguage;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setTestProgress([]);

    const result = await testConnection(
      settings.provider,
      (progressStep) => {
        setTestProgress((prev) => [...prev, progressStep]);
      },
      selectedLanguage || settings.targetLanguage,
    );

    setTestResult(result);
    setIsTesting(false);
    await updateProvider({ connectionStatus: result.overall ? 'success' : 'error' });
    // Keep pool status in sync with the mirror
    updateSettings({
      providers: syncProviderToPool(settings.providers ?? [], {
        connectionStatus: result.overall ? 'success' : 'error',
      }),
    });

    if (result.overall) {
      showSuccess('Provider connection verified.');
    } else {
      const failed = result.steps.find((s) => !s.success);
      const message = getConnectionErrorMessage(failed?.error);
      showError(`${message.title}: ${message.action}`);
    }
  };

  const handleFinish = async () => {
    await updateSettings({
      targetLanguage: selectedLanguage,
      onboarding: { completed: true, skipped: false, lastStep: 'done' },
    });
    setStep('done');
  };

  const handleTranslate = async () => {
    if (!onTranslateCurrentPage) {
      onClose();
      return;
    }
    setIsTranslating(true);
    try {
      const result = await onTranslateCurrentPage();
      if (result.ok) {
        showSuccess('Translation started on the active page.');
        onClose();
        return;
      }
      if (result.reason === 'no-tab') {
        showError('Open a regular webpage, then try again — or use the extension popup.');
      } else if (result.reason === 'no-content-script') {
        showError('Could not reach that page. Refresh the tab, then translate from the popup.');
      } else {
        showError('Could not start translation. Use the extension popup on a webpage.');
      }
    } finally {
      setIsTranslating(false);
    }
  };

  const failedStep = testResult?.steps.find((s) => !s.success);
  const failedMessage = getConnectionErrorMessage(failedStep?.error);
  const currentIndex = wizardStepIndex(step);

  const goToCompletedStep = (target: WizardStep) => {
    const targetIdx = wizardStepIndex(target);
    if (targetIdx < currentIndex && target !== 'done') {
      void setWizardStep(target);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 sm:p-6"
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-2xl my-auto flex max-h-[min(92vh,760px)] min-h-0 flex-col overflow-hidden rounded-2xl border border-cyan-500/15 bg-zinc-950 shadow-2xl shadow-cyan-950/40 animate-scale-in"
      >
        {/* Brand accent bar */}
        <div
          className="h-1 w-full shrink-0 bg-gradient-to-r from-cyan-500 via-sky-500 to-amber-400"
          aria-hidden="true"
        />

        {/* Soft brand glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-24 -right-16 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute top-40 -left-20 h-40 w-40 rounded-full bg-sky-500/5 blur-3xl" />
        </div>

        {/* Header + stepper */}
        <div className="relative flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800/90 px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
              Step {currentIndex} of {WIZARD_STEPS.length}
            </p>
            <h2 id={titleId} className="truncate text-lg font-semibold text-zinc-100">
              Setup guide
            </h2>
            <nav className="mt-3" aria-label="Setup progress">
              <ol className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {WIZARD_STEPS.map((s) => {
                  const idx = wizardStepIndex(s);
                  const isCompleted = idx < currentIndex;
                  const isCurrent = s === step;
                  const clickable = isCompleted && s !== 'done';
                  return (
                    <li key={s} className="flex min-w-0 items-center gap-1.5">
                      <button
                        type="button"
                        disabled={!clickable}
                        onClick={() => goToCompletedStep(s)}
                        className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                          isCurrent
                            ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/40'
                            : isCompleted
                              ? 'bg-cyan-500/10 text-cyan-400/90 hover:bg-cyan-500/20 cursor-pointer'
                              : 'bg-zinc-800/80 text-zinc-500 cursor-default'
                        } ${!clickable ? 'cursor-default' : ''}`}
                        aria-current={isCurrent ? 'step' : undefined}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                            isCurrent
                              ? 'bg-cyan-500 text-zinc-950'
                              : isCompleted
                                ? 'bg-cyan-600 text-white'
                                : 'bg-zinc-700 text-zinc-400'
                          }`}
                          aria-hidden="true"
                        >
                          {isCompleted ? '✓' : idx}
                        </span>
                        <span className="hidden sm:inline">{WIZARD_STEP_LABELS[s]}</span>
                      </button>
                      {idx < WIZARD_STEPS.length && (
                        <span className="hidden h-px w-2 bg-zinc-700 sm:block" aria-hidden="true" />
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          </div>
          {step !== 'done' && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => setShowSkipConfirm(true)}
            >
              Skip for now
            </Button>
          )}
        </div>

        {/* Scrollable body */}
        <div className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-5 sm:p-6">
          <div key={step} className="animate-fade-in-up">
            {step === 'welcome' && (
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-500/25 bg-cyan-500/15">
                    <Languages className="h-7 w-7 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight text-zinc-50">
                      See the web in your language
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                      Connect any OpenAI-compatible provider or a local Ollama endpoint. Keys stay on
                      your device — we only talk to the endpoint you choose.
                    </p>
                  </div>
                </div>

                <ul className="grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      icon: <Server className="h-4 w-4 text-cyan-400" />,
                      title: 'Any LLM',
                      body: 'OpenRouter, Groq, Ollama, LM Studio, and custom OpenAI-compatible APIs.',
                    },
                    {
                      icon: <Lock className="h-4 w-4 text-sky-400" />,
                      title: 'Privacy-first',
                      body: 'No telemetry. Credentials never leave your browser except to your provider.',
                    },
                    {
                      icon: <Sparkles className="h-4 w-4 text-amber-400" />,
                      title: 'Quick setup',
                      body: 'Pick a template, test the connection, choose a language — done.',
                    },
                  ].map((item) => (
                    <li
                      key={item.title}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5"
                    >
                      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-900">
                        {item.icon}
                      </div>
                      <p className="text-sm font-medium text-zinc-100">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">{item.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {step === 'provider' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-zinc-100">Choose where translations run</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    Search a known host to auto-fill the base URL, then add your key and model.
                  </p>
                </div>
                <Card title="Provider" icon={<Server className="w-4 h-4" />} variant="bordered" accent="cyan">
                  <div className="space-y-4 min-w-0">
                    <ProviderCatalogPicker
                      compact
                      selectedCatalogId={catalogId}
                      provider={settings.provider}
                      onSelect={({ patch }) => updateProviderAndPool(patch)}
                    />
                    <FieldGroup label="Base URL" htmlFor="setup-base-url">
                      <Input
                        id="setup-base-url"
                        value={settings.provider.baseUrl}
                        onChange={(e) =>
                          updateProviderAndPool({
                            baseUrl: e.target.value,
                            connectionStatus: 'unknown',
                          })
                        }
                        placeholder="https://api.example.com/v1"
                      />
                    </FieldGroup>
                    <FieldGroup
                      label="API Key"
                      htmlFor="setup-api-key"
                      description={
                        settings.provider.requiresApiKey
                          ? 'Required for this provider.'
                          : 'Optional — leave blank for local providers.'
                      }
                    >
                      <Input
                        id="setup-api-key"
                        type="password"
                        value={settings.provider.apiKey}
                        onChange={(e) =>
                          updateProviderAndPool({
                            apiKey: e.target.value,
                            connectionStatus: 'unknown',
                          })
                        }
                        placeholder={apiKeyPlaceholder}
                      />
                    </FieldGroup>
                    <ModelPicker
                      inputId="setup-model"
                      provider={settings.provider}
                      onModelChange={(model) =>
                        updateProviderAndPool({ model, connectionStatus: 'unknown' })
                      }
                    />
                    {!canContinueToTest && (
                      <div
                        className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5"
                        role="status"
                      >
                        <p className="text-sm font-medium text-amber-200">{recovery.title}</p>
                        <p className="mt-0.5 text-xs text-amber-100/75">
                          {recovery.action}
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {step === 'test' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-zinc-100">Prove the connection</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    We ping the endpoint, list models when supported, and run a tiny translation.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 text-xs text-zinc-300">
                    <Server className="h-3 w-3 text-cyan-400" />
                    {providerLabel}
                  </span>
                  <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 font-mono text-xs text-zinc-400">
                    {modelLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 text-xs text-zinc-300">
                    <Globe2 className="h-3 w-3 text-sky-400" />
                    → {getTargetLanguages().find((l) => l.code === selectedLanguage)?.nativeName
                      ?? targetLangLabel}
                  </span>
                </div>

                <Card title="Connection test" icon={<Zap className="w-4 h-4" />} variant="bordered" accent="cyan">
                  <div className="space-y-4">
                    <Button
                      onClick={handleTestConnection}
                      loading={isTesting}
                      icon={!isTesting ? <Zap className="w-4 h-4" /> : undefined}
                    >
                      {isTesting ? 'Testing…' : testResult ? 'Retry test' : 'Test connection'}
                    </Button>
                    <ConnectionTestProgressList steps={testProgress} isTesting={isTesting} />
                    {isTesting && testProgress.length === 0 && (
                      <p className="text-sm text-zinc-400">
                        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                        Starting connection test…
                      </p>
                    )}
                    {testResult?.overall && (
                      <div className="flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        <div>
                          <p className="text-sm font-medium text-emerald-300">Connection successful</p>
                          <p className="mt-0.5 text-xs text-emerald-200/70">
                            Your provider is ready. Continue to choose a target language.
                          </p>
                        </div>
                      </div>
                    )}
                    {!testResult && settings.provider.connectionStatus === 'success' && (
                      <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/80" />
                        <p className="text-sm text-emerald-200/90">
                          Previously verified. You can continue, or re-run the test to confirm.
                        </p>
                      </div>
                    )}
                    {testResult && !testResult.overall && (
                      <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 p-3">
                        <p className="text-sm font-medium text-rose-300">{failedMessage.title}</p>
                        <p className="mt-1 text-xs text-rose-200/80">{failedMessage.description}</p>
                        <p className="mt-1.5 text-xs font-medium text-rose-200/90">
                          Next: {failedMessage.action}
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {step === 'language' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-zinc-100">What should pages become?</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    Source language stays on Auto by default. You can change this anytime in General
                    settings.
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Popular
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {POPULAR_LANGUAGES.map((lang) => {
                      const active = selectedLanguage === lang.code;
                      return (
                        <button
                          key={lang.code}
                          type="button"
                          onClick={() => setSelectedLanguage(lang.code)}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                            active
                              ? 'bg-cyan-500 text-zinc-950 ring-2 ring-cyan-400/40'
                              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          }`}
                          aria-pressed={active}
                        >
                          {lang.nativeName}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <FieldGroup
                  label="All languages"
                  htmlFor="setup-target-language"
                  description="Full list of supported target languages."
                >
                  <Select
                    id="setup-target-language"
                    aria-label="Target language"
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    options={TARGET_LANGUAGE_OPTIONS}
                  />
                </FieldGroup>
              </div>
            )}

            {step === 'done' && (
              <div className="space-y-5 py-2 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15">
                  <CheckCircle2 className="h-9 w-9 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-zinc-100">You&apos;re ready to translate</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
                    Provider connected
                    {settings.provider.displayName ? ` (${settings.provider.displayName})` : ''}
                    {' · '}
                    target{' '}
                    {getTargetLanguages().find((l) => l.code === selectedLanguage)?.nativeName
                      ?? selectedLanguage}
                    .
                  </p>
                </div>
                <ul className="mx-auto flex max-w-sm flex-col gap-2 text-left text-xs text-zinc-500">
                  <li className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                    <KeyRound className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                    Manage providers anytime in the Providers tab
                  </li>
                  <li className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                    <Languages className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                    Change language in General settings
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Sticky footer */}
        <div className="relative flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-800/90 bg-zinc-950/95 px-5 py-3.5 sm:px-6">
          {step === 'welcome' && (
            <>
              <Button variant="ghost" onClick={() => setShowSkipConfirm(true)}>
                Skip for now
              </Button>
              <Button onClick={() => setWizardStep('provider')}>Start setup</Button>
            </>
          )}
          {step === 'provider' && (
            <>
              <Button variant="ghost" onClick={() => setWizardStep('welcome')}>
                Back
              </Button>
              <Button
                disabled={!canContinueToTest}
                onClick={() => setWizardStep('test')}
                title={!canContinueToTest ? recovery.action : undefined}
              >
                Continue to test
              </Button>
            </>
          )}
          {step === 'test' && (
            <>
              <Button variant="ghost" onClick={() => setWizardStep('provider')}>
                Back
              </Button>
              <Button disabled={!canProceedPastTest} onClick={() => setWizardStep('language')}>
                Choose language
              </Button>
            </>
          )}
          {step === 'language' && (
            <>
              <Button variant="ghost" onClick={() => setWizardStep('test')}>
                Back
              </Button>
              <Button onClick={handleFinish}>Finish setup</Button>
            </>
          )}
          {step === 'done' && (
            <>
              <Button variant="secondary" onClick={onClose}>
                Open settings
              </Button>
              {onTranslateCurrentPage ? (
                <Button loading={isTranslating} onClick={handleTranslate}>
                  Translate current page
                </Button>
              ) : (
                <span />
              )}
            </>
          )}
        </div>

        {/* Skip confirmation overlay */}
        {showSkipConfirm && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="skip-confirm-title"
            aria-describedby="skip-confirm-desc"
          >
            <div className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl animate-scale-in">
              <h3 id="skip-confirm-title" className="text-base font-semibold text-zinc-100">
                Skip setup?
              </h3>
              <p id="skip-confirm-desc" className="mt-2 text-sm leading-6 text-zinc-400">
                You won&apos;t be able to translate until a provider is configured. You can resume
                anytime from the popup or Providers settings.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowSkipConfirm(false)}>
                  Keep going
                </Button>
                <Button variant="secondary" size="sm" onClick={handleSkip}>
                  Skip for now
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
