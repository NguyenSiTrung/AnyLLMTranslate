/**
 * First-run / resume setup wizard — connect, verify (language + test), ready.
 * Shell + step components; orchestration and storage writes live here.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { getCatalogEntryById } from '@/lib/openAiCompatibleCatalog';
import { syncProviderToPool } from '@/lib/config';
import type { ProviderConfig } from '@/types/config';
import {
  inferCatalogId,
  resolveCatalogSelection,
} from './components/ProviderCatalogPicker';
import { getTargetLanguages } from '@/lib/languages';
import { testConnection } from '@/services/providerTester';
import type { ConnectionTestResult, ConnectionTestStep } from '@/services/providerTester';
import {
  getConnectionErrorMessage,
  getProviderReadiness,
  getProviderRecoveryMessage,
} from '@/lib/providerReadiness';
import {
  type CatalogFilterId,
  type TranslatePageResult,
  type WizardStep,
  getPopularTargetLanguages,
  normalizeWizardStep,
  providerPatchInvalidatesTest,
  resolveWizardEntryStep,
  wizardStepIndex,
} from '@/lib/setupWizard';
import type { OpenAiCompatibleCatalogEntry } from '@/lib/openAiCompatibleCatalog';
import { Button } from '@/ui/Button';
import { useToast } from '@/ui/ToastProvider';
import { WizardShell } from './components/wizard/WizardShell';
import { WelcomeStep } from './components/wizard/steps/WelcomeStep';
import { ConnectStep, type ConnectPhase } from './components/wizard/steps/ConnectStep';
import { VerifyStep } from './components/wizard/steps/VerifyStep';
import { ReadyStep } from './components/wizard/steps/ReadyStep';

interface SetupWizardProps {
  open: boolean;
  onClose: () => void;
  /** Attempt to start translation on a normal browser tab. */
  onTranslateCurrentPage?: () => Promise<TranslatePageResult>;
  /** Optional entry override (e.g. deep-link `?step=verify`). */
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
  const { error: showError, success: showSuccess } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [step, setStep] = useState<WizardStep>('welcome');
  const [connectPhase, setConnectPhase] = useState<ConnectPhase>('choose');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilterId>('all');
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
   * Atomically update the legacy provider mirror AND providers[0] so the pool
   * coordinator sees wizard edits. Must be a single storage write.
   */
  const updateProviderAndPool = useCallback(
    (patch: Partial<ProviderConfig>) => {
      if (providerPatchInvalidatesTest(patch)) {
        clearTestState();
      }
      const { provider, providers } = useSettingsStore.getState();
      void updateSettings({
        provider: { ...provider, ...patch },
        providers: syncProviderToPool(providers ?? [], patch),
      });
    },
    [updateSettings, clearTestState],
  );

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
      (forced && normalizeWizardStep(forced)) ||
      resolveWizardEntryStep(onboardingRef.current);
    setStep(entry);
    setSelectedLanguage(targetLanguageRef.current);
    setShowSkipConfirm(false);
    setTestResult(null);
    setTestProgress([]);
    setIsTesting(false);
    setCatalogQuery('');
    setCatalogFilter('all');

    // Reconfigure: land on credentials if provider already has a template
    const completed = onboardingRef.current.completed;
    const { provider } = useSettingsStore.getState();
    if (entry === 'connect' && completed && provider.baseUrl.trim()) {
      setConnectPhase('credentials');
    } else {
      setConnectPhase('choose');
    }

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
        if (step === 'ready' || settings.onboarding.completed) {
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
      onboarding: {
        completed: false,
        skipped: true,
        lastStep: step === 'ready' ? 'verify' : step,
      },
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
    getTargetLanguages().find((l) => l.code === selectedLanguage)?.nativeName ??
    selectedLanguage;

  const handleSelectCatalogEntry = (entry: OpenAiCompatibleCatalogEntry) => {
    const selection = resolveCatalogSelection(entry, settings.provider);
    updateProviderAndPool(selection.patch);
  };

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
    const status = result.overall ? 'success' : 'error';
    const { provider, providers } = useSettingsStore.getState();
    await updateSettings({
      provider: { ...provider, connectionStatus: status },
      providers: syncProviderToPool(providers ?? [], { connectionStatus: status }),
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
      onboarding: { completed: true, skipped: false, lastStep: 'ready' },
    });
    setStep('ready');
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
    if (targetIdx < currentIndex && target !== 'ready') {
      void setWizardStep(target);
    }
  };

  const shellTitle = settings.onboarding.completed
    ? 'Update provider'
    : 'Get ready to translate';

  const showSkip = step === 'connect' || step === 'verify';

  let footer: ReactNode = null;
  if (step === 'welcome') {
    footer = (
      <>
        <Button variant="ghost" onClick={() => setShowSkipConfirm(true)}>
          Skip for now
        </Button>
        <Button
          onClick={() => setWizardStep('connect')}
          className="bg-cyan-600 hover:bg-cyan-500 text-white disabled:bg-zinc-700 disabled:text-zinc-500"
        >
          Get started
        </Button>
      </>
    );
  } else if (step === 'connect') {
    footer = (
      <>
        <Button
          variant="ghost"
          onClick={() => {
            if (connectPhase === 'credentials') {
              setConnectPhase('choose');
            } else {
              void setWizardStep('welcome');
            }
          }}
        >
          Back
        </Button>
        <Button
          disabled={!canContinueToTest || connectPhase === 'choose'}
          onClick={() => setWizardStep('verify')}
          title={
            connectPhase === 'choose'
              ? 'Select a provider first'
              : !canContinueToTest
                ? recovery.action
                : undefined
          }
          className="bg-cyan-600 hover:bg-cyan-500 text-white disabled:bg-zinc-700 disabled:text-zinc-500"
        >
          Continue to verify
        </Button>
      </>
    );
  } else if (step === 'verify') {
    footer = (
      <>
        <Button variant="ghost" onClick={() => setWizardStep('connect')}>
          Back
        </Button>
        <Button
          disabled={!canProceedPastTest}
          onClick={handleFinish}
          className="bg-cyan-600 hover:bg-cyan-500 text-white disabled:bg-zinc-700 disabled:text-zinc-500"
        >
          Finish setup
        </Button>
      </>
    );
  } else if (step === 'ready') {
    footer = (
      <>
        <Button variant="secondary" onClick={onClose}>
          Open settings
        </Button>
        {onTranslateCurrentPage ? (
          <Button
            loading={isTranslating}
            onClick={handleTranslate}
            className="bg-cyan-600 hover:bg-cyan-500 text-white disabled:bg-zinc-700 disabled:text-zinc-500"
          >
            Translate current page
          </Button>
        ) : (
          <span />
        )}
      </>
    );
  }

  const skipConfirm = showSkipConfirm ? (
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
          You won&apos;t be able to translate until a provider is configured. You can resume anytime
          from the popup or Providers settings.
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
  ) : null;

  return (
    <WizardShell
      title={shellTitle}
      titleId={titleId}
      step={step}
      showSkip={showSkip}
      onSkip={() => setShowSkipConfirm(true)}
      onGoToCompletedStep={goToCompletedStep}
      footer={footer}
      skipConfirm={skipConfirm}
      dialogRef={dialogRef}
    >
      {step === 'welcome' && <WelcomeStep />}
      {step === 'connect' && (
        <ConnectStep
          phase={connectPhase}
          onPhaseChange={setConnectPhase}
          catalogFilter={catalogFilter}
          onCatalogFilterChange={setCatalogFilter}
          catalogQuery={catalogQuery}
          onCatalogQueryChange={setCatalogQuery}
          catalogId={catalogId}
          provider={settings.provider}
          canContinueToTest={canContinueToTest}
          recovery={recovery}
          apiKeyPlaceholder={apiKeyPlaceholder}
          onSelectCatalogEntry={handleSelectCatalogEntry}
          onProviderPatch={updateProviderAndPool}
        />
      )}
      {step === 'verify' && (
        <VerifyStep
          providerLabel={providerLabel}
          modelLabel={modelLabel}
          selectedLanguage={selectedLanguage}
          onLanguageChange={setSelectedLanguage}
          popularLanguages={POPULAR_LANGUAGES}
          targetLanguageOptions={TARGET_LANGUAGE_OPTIONS}
          isTesting={isTesting}
          testResult={testResult}
          testProgress={testProgress}
          connectionStatus={settings.provider.connectionStatus ?? 'unknown'}
          onTest={handleTestConnection}
          failedMessage={failedMessage}
        />
      )}
      {step === 'ready' && (
        <ReadyStep
          providerDisplayName={settings.provider.displayName}
          targetLanguageLabel={targetLangLabel}
        />
      )}
    </WizardShell>
  );
}
