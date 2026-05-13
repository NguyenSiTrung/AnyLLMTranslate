import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Languages, Loader2, Server, XCircle, Zap } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { PROVIDER_PRESETS } from '@/types/config';
import type { OnboardingState, ProviderPreset } from '@/types/config';
import { LANGUAGES } from '@/lib/languages';
import { testConnection } from '@/services/providerTester';
import type { ConnectionTestResult, ConnectionTestStep } from '@/services/providerTester';
import { getConnectionErrorMessage } from '@/lib/providerReadiness';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Select } from '@/ui/Select';
import { useToast } from '@/ui/ToastProvider';

type WizardStep = NonNullable<OnboardingState['lastStep']>;

interface SetupWizardProps {
  open: boolean;
  onClose: () => void;
  onTranslateCurrentPage?: () => void;
}

const STEP_INDEX: Record<WizardStep, number> = {
  welcome: 1,
  provider: 2,
  test: 3,
  language: 4,
  done: 5,
};

export function SetupWizard({ open, onClose, onTranslateCurrentPage }: SetupWizardProps) {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const updateProvider = useSettingsStore((s) => s.updateProvider);
  const { error: showError, success: showSuccess } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<WizardStep>(settings.onboarding.lastStep ?? 'welcome');
  const [selectedLanguage, setSelectedLanguage] = useState(settings.targetLanguage);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testProgress, setTestProgress] = useState<ConnectionTestStep[]>([]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
  }, [open, step]);

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
      onboarding: { completed: false, skipped: true, lastStep: step },
    });
    onClose();
  };

  const handlePresetChange = async (preset: ProviderPreset) => {
    const presetDef = PROVIDER_PRESETS.find((p) => p.preset === preset);
    if (!presetDef) return;
    if (preset === 'langflow') {
      await updateProvider({
        preset,
        baseUrl: '',
        model: '',
        displayName: presetDef.displayName,
        requiresApiKey: presetDef.requiresApiKey,
        endpointUrl: settings.provider.endpointUrl || '',
        componentId: settings.provider.componentId || '',
        responseTextPath: settings.provider.responseTextPath || 'outputs[0].outputs[0].results.text.text',
        connectionStatus: 'unknown',
      });
    } else {
      await updateProvider({
        preset,
        baseUrl: presetDef.baseUrl,
        model: presetDef.defaultModel,
        displayName: presetDef.displayName,
        requiresApiKey: presetDef.requiresApiKey,
        connectionStatus: 'unknown',
      });
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setTestProgress([]);

    const result = await testConnection(settings.provider, (progressStep) => {
      setTestProgress((prev) => [...prev, progressStep]);
    });

    setTestResult(result);
    setIsTesting(false);
    await updateProvider({ connectionStatus: result.overall ? 'success' : 'error' });

    if (result.overall) {
      showSuccess('Provider connection verified.');
    } else {
      const failedStep = result.steps.find((s) => !s.success);
      const message = getConnectionErrorMessage(failedStep?.error);
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

  const failedStep = testResult?.steps.find((s) => !s.success);
  const failedMessage = getConnectionErrorMessage(failedStep?.error);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" role="presentation">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="AnyLLMTranslate setup guide"
        className="w-full max-w-2xl mx-4 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <p className="text-xs text-blue-400 font-semibold uppercase tracking-wider">Step {STEP_INDEX[step]} of 5</p>
            <h2 className="text-lg font-semibold text-zinc-100">Setup guide</h2>
            {/* M5: Visual progress bar */}
            <div className="flex items-center gap-1.5 mt-2">
              {[1, 2, 3, 4, 5].map((s) => {
                const current = STEP_INDEX[step];
                const isCompleted = s < current;
                const isCurrent = s === current;
                return (
                  <div
                    key={s}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      isCompleted
                        ? 'w-8 bg-blue-500'
                        : isCurrent
                          ? 'w-8 bg-blue-400 animate-pulse'
                          : 'w-8 bg-zinc-700'
                    }`}
                  />
                );
              })}
            </div>
          </div>
          {step !== 'welcome' && <Button variant="ghost" size="sm" onClick={handleSkip}>Skip for now</Button>}
        </div>

        <div className="p-6">
          {step === 'welcome' && (
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                  <Languages className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-zinc-100">Translate with your own LLM</h3>
                  <p className="text-sm text-zinc-400 mt-2 leading-6">
                    Connect any OpenAI-compatible provider, Ollama, or Langflow endpoint, test it, then choose your target language.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={handleSkip}>Skip for now</Button>
                <Button onClick={() => setWizardStep('provider')}>Start setup</Button>
              </div>
            </div>
          )}

          {step === 'provider' && (
            <div className="space-y-5">
              <Card title="Provider" icon={<Server className="w-4 h-4" />} variant="bordered">
                <div className="space-y-4">
                  <FieldGroup label="Provider preset">
                    <div className="grid grid-cols-2 gap-2">
                      {PROVIDER_PRESETS.map((preset) => (
                        <button
                          key={preset.preset}
                          type="button"
                          onClick={() => handlePresetChange(preset.preset)}
                          className={`text-left p-3 rounded-lg border ${settings.provider.preset === preset.preset ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-zinc-800 bg-zinc-900 text-zinc-300'}`}
                        >
                          <div className="font-medium text-sm">{preset.displayName}</div>
                          <div className="text-xs text-zinc-500 mt-1 truncate">{preset.preset === 'langflow' ? preset.description : (preset.baseUrl || 'Bring your own endpoint')}</div>
                        </button>
                      ))}
                    </div>
                  </FieldGroup>

                  {settings.provider.preset === 'langflow' ? (
                    <>
                      <FieldGroup label="Endpoint URL" htmlFor="setup-endpoint-url">
                        <Input id="setup-endpoint-url" value={settings.provider.endpointUrl || ''} onChange={(e) => updateProvider({ endpointUrl: e.target.value, connectionStatus: 'unknown' })} placeholder="https://your-langflow-server/api/v1/run/your-flow" />
                      </FieldGroup>
                      <FieldGroup label="API Key" htmlFor="setup-api-key" description="Required for Langflow authentication.">
                        <Input id="setup-api-key" type="password" value={settings.provider.apiKey} onChange={(e) => updateProvider({ apiKey: e.target.value, connectionStatus: 'unknown' })} placeholder="lf-..." />
                      </FieldGroup>
                      <FieldGroup label="Component ID" htmlFor="setup-component-id">
                        <Input id="setup-component-id" value={settings.provider.componentId || ''} onChange={(e) => updateProvider({ componentId: e.target.value, connectionStatus: 'unknown' })} placeholder="ChatModel-XXXXX" />
                      </FieldGroup>
                    </>
                  ) : (
                    <>
                      <FieldGroup label="Base URL" htmlFor="setup-base-url">
                        <Input id="setup-base-url" value={settings.provider.baseUrl} onChange={(e) => updateProvider({ baseUrl: e.target.value, connectionStatus: 'unknown' })} />
                      </FieldGroup>
                      <FieldGroup label="API Key" htmlFor="setup-api-key" description={settings.provider.requiresApiKey ? 'Required for this provider.' : 'Optional for local providers.'}>
                        <Input id="setup-api-key" type="password" value={settings.provider.apiKey} onChange={(e) => updateProvider({ apiKey: e.target.value, connectionStatus: 'unknown' })} />
                      </FieldGroup>
                      <FieldGroup label="Model" htmlFor="setup-model">
                        <Input id="setup-model" value={settings.provider.model} onChange={(e) => updateProvider({ model: e.target.value, connectionStatus: 'unknown' })} />
                      </FieldGroup>
                    </>
                  )}
                </div>
              </Card>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setWizardStep('welcome')}>Back</Button>
                <Button onClick={() => setWizardStep('test')}>Continue to test</Button>
              </div>
            </div>
          )}

          {step === 'test' && (
            <div className="space-y-5">
              <Card title="Test connection" icon={<Zap className="w-4 h-4" />} variant="bordered">
                <div className="space-y-4">
                  <Button onClick={handleTestConnection} loading={isTesting} icon={!isTesting ? <Zap className="w-4 h-4" /> : undefined}>
                    {isTesting ? 'Testing...' : 'Test connection'}
                  </Button>
                  {testProgress.length > 0 && (
                    <div className="space-y-2" aria-live="polite">
                      {testProgress.map((progressStep) => (
                        <div key={progressStep.name} className="flex items-center gap-2 text-sm">
                          {progressStep.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                          <span className="capitalize text-zinc-300">{progressStep.name}</span>
                          <span className="ml-auto text-xs text-zinc-500">{progressStep.latencyMs}ms</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {isTesting && <p className="text-sm text-zinc-400"><Loader2 className="inline w-4 h-4 animate-spin mr-2" />Checking provider...</p>}
                  {testResult?.overall && <p className="text-sm text-emerald-400 font-medium">Connection successful.</p>}
                  {testResult && !testResult.overall && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                      <p className="text-sm font-medium text-red-300">{failedMessage.title}</p>
                      <p className="text-xs text-red-200/80 mt-1">{failedMessage.action}</p>
                    </div>
                  )}
                </div>
              </Card>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setWizardStep('provider')}>Back</Button>
                <Button disabled={!testResult?.overall} onClick={() => setWizardStep('language')}>Choose language</Button>
              </div>
            </div>
          )}

          {step === 'language' && (
            <div className="space-y-5">
              <FieldGroup label="Target language" htmlFor="setup-target-language" description="Source language stays on Auto by default.">
                <Select
                  id="setup-target-language"
                  aria-label="Target language"
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  options={LANGUAGES.filter((language) => language.code !== 'auto').map((language) => ({ value: language.code, label: language.nativeName }))}
                />
              </FieldGroup>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setWizardStep('test')}>Back</Button>
                <Button onClick={handleFinish}>Finish setup</Button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-5 text-center">
              <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
              <div>
                <h3 className="text-xl font-semibold text-zinc-100">You're ready to translate</h3>
                <p className="text-sm text-zinc-400 mt-2">Your provider is connected and your target language is set.</p>
              </div>
              <div className="flex justify-center gap-3">
                <Button variant="secondary" onClick={onClose}>Open settings</Button>
                {onTranslateCurrentPage && <Button onClick={onTranslateCurrentPage}>Translate current page</Button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
