/**
 * Provider Settings Section — API config, test connection, system prompt editor.
 * Header uses inline SectionHeader pattern (consistent with GeneralSection).
 */

import { useState, useCallback } from 'react';
import {
  Loader2, CheckCircle2, XCircle, RotateCcw,
  Zap, ChevronDown, AlertTriangle, Server, Radio,
} from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import { getCatalogEntryById } from '@/lib/openAiCompatibleCatalog';
import { ProviderCatalogPicker, inferCatalogId } from '../components/ProviderCatalogPicker';
import { ModelPicker } from '../components/ModelPicker';
import { testConnection } from '@/services/providerTester';
import type { ConnectionTestResult, ConnectionTestStep } from '@/services/providerTester';
import { getProviderReadiness, getProviderRecoveryMessage } from '@/lib/providerReadiness';
import {
  DEFAULT_SYSTEM_PROMPT_TEMPLATE,
  validatePromptTemplate,
} from '@/services/base';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Slider } from '@/ui/Slider';
import { useToast } from '@/ui/ToastProvider';

interface ProviderSectionProps {
  onOpenSetup?: () => void;
}

export function ProviderSection({ onOpenSetup }: ProviderSectionProps = {}) {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const updateProvider = useSettingsStore((s) => s.updateProvider);
  const { error: showError, success: showSuccess } = useToast();

  const readiness = getProviderReadiness(settings.provider);
  const recoveryMessage = getProviderRecoveryMessage(readiness);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testProgress, setTestProgress] = useState<ConnectionTestStep[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const catalogId = inferCatalogId(settings.provider.baseUrl);
  const catalogEntry = getCatalogEntryById(catalogId);
  const apiKeyPlaceholder = catalogEntry?.placeholder ?? 'sk-...';

  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    setTestResult(null);
    setTestProgress([]);

    const result = await testConnection(settings.provider, (step) => {
      setTestProgress((prev) => [...prev, step]);
    }, settings.targetLanguage);

    setTestResult(result);
    setIsTesting(false);

    // Save connection status to provider config
    updateProvider({ connectionStatus: result.overall ? 'success' : 'error' });

    if (result.overall) {
      showSuccess('Connection test passed! All checks successful.');
    } else {
      const failedStep = result.steps.find((s) => !s.success);
      showError(`Connection test failed: ${failedStep?.error ?? 'Unknown error'}`);
    }
  }, [settings.provider, showSuccess, showError, updateProvider]);

  const promptValidation = settings.customSystemPrompt
    ? validatePromptTemplate(settings.customSystemPrompt)
    : null;

  const completedSteps = testProgress.filter((s) => s.success).length;
  const totalSteps = 3;
  const progressPct = (completedSteps / totalSteps) * 100;

  const stepLabels = { ping: 'API Ping', models: 'Model Listing', translation: 'Translation Test' };

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Translation Provider"
        description="Configure the LLM provider for translations."
        icon={<Zap className="w-4 h-4" />}
        accentColor="amber"
      />

      <div className="space-y-4">
        <div className="animate-stagger" style={stagger(0)}>
          <Card variant="bordered" className={readiness.status === 'connected' ? 'border-emerald-500/30' : 'border-amber-500/30'}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${readiness.status === 'connected' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                {readiness.status === 'connected' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-zinc-100">{recoveryMessage.title}</h3>
                <p className="text-xs text-zinc-400 mt-1 leading-5">{recoveryMessage.description}</p>
                <p className="text-xs text-zinc-500 mt-1">Next: {recoveryMessage.action}</p>
              </div>
              {onOpenSetup && (
                <Button size="sm" variant={readiness.status === 'connected' ? 'secondary' : 'primary'} onClick={onOpenSetup}>
                  Open setup guide
                </Button>
              )}
            </div>
          </Card>
        </div>

        {/* Essential fields */}
        <div className="animate-stagger" style={stagger(1)}>
          <Card title="Provider Configuration" icon={<Server className="w-3.5 h-3.5" />} variant="bordered">
            <div className="space-y-4">
	              <ProviderCatalogPicker
	                selectedCatalogId={catalogId}
	                provider={settings.provider}
	                onSelect={({ patch }) => updateProvider(patch)}
	              />

              {/* OpenAI Compatible: Base URL */}
                  <FieldGroup
                    label="Base URL"
                    description="The API endpoint for your provider."
                    htmlFor="provider-base-url"
                  >
                    <Input
                      id="provider-base-url"
                      type="url"
                      value={settings.provider.baseUrl}
                      onChange={(e) => updateProvider({ baseUrl: e.target.value, connectionStatus: 'unknown' })}
                      placeholder="https://api.example.com/v1"
                      className="font-mono"
                    />
                  </FieldGroup>

                  {/* OpenAI Compatible: API Key */}
                  <FieldGroup
                    label="API Key"
                    description={settings.provider.requiresApiKey ? 'Required for this provider.' : 'Optional — leave blank for local providers.'}
                    htmlFor="provider-api-key"
                  >
                    <Input
                      id="provider-api-key"
                      type="password"
                      value={settings.provider.apiKey}
                      onChange={(e) => updateProvider({ apiKey: e.target.value, connectionStatus: 'unknown' })}
	                      placeholder={apiKeyPlaceholder}
                      className="font-mono"
                    />
                  </FieldGroup>

	                  <ModelPicker
	                    provider={settings.provider}
	                    testModels={testResult?.models ?? []}
	                    onModelChange={(model) => updateProvider({ model, connectionStatus: 'unknown' })}
	                  />
            </div>
          </Card>
        </div>

        {/* Connection Test */}
        <div className="animate-stagger" style={stagger(2)}>
          <Card title="Connection Test" icon={<Radio className="w-3.5 h-3.5" />} variant="bordered">
            <div className="space-y-3">
              {/* Progress bar */}
              {(testProgress.length > 0 || isTesting) && (
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}

              {/* Test button */}
              <Button
                id="test-connection-btn"
                onClick={handleTestConnection}
                loading={isTesting}
                icon={!isTesting ? <Zap className="w-4 h-4" /> : undefined}
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
              </Button>

              {/* Progress Steps */}
              {(testProgress.length > 0 || isTesting) && (
                <div className="space-y-2" aria-live="polite">
                  {(['ping', 'models', 'translation'] as const).map((stepName, idx) => {
                    const step = testProgress.find((s) => s.name === stepName);
                    return (
                      <div key={stepName} className="flex items-center gap-3 text-sm">
                        {step ? (
                          step.success ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                          )
                        ) : isTesting && testProgress.length === idx ? (
                          <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-zinc-600 shrink-0" />
                        )}
                        <span className={step ? (step.success ? 'text-zinc-200' : 'text-red-400') : 'text-zinc-500'}>
                          {stepLabels[stepName]}
                        </span>
                        {step && step.latencyMs > 0 && (
                          <span className="text-xs text-zinc-500 ml-auto">{step.latencyMs}ms</span>
                        )}
                      </div>
                    );
                  })}

                  {testResult && testResult.translationSample && (
                    <div className="mt-2 p-3 bg-zinc-800/50 rounded-lg">
                      <p className="text-xs text-zinc-500 mb-1">Translation sample:</p>
                      <p className="text-sm text-zinc-200">&ldquo;{testResult.translationSample}&rdquo;</p>
                    </div>
                  )}

                  {/* Success celebration */}
                  {testResult && testResult.overall && (
                    <div className="mt-3 flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg animate-scale-in animate-glow-pulse">
                      <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center animate-scale-in">
                        <CheckCircle2 className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-emerald-400">All checks passed!</p>
                        <p className="text-xs text-zinc-500">Your provider is configured correctly.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Advanced accordion — wrapped in Card for consistency */}
        <div className="animate-stagger" style={stagger(3)}>
          <Card variant="bordered" className="p-0 overflow-hidden">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium text-zinc-300 hover:bg-zinc-800/50 transition-colors cursor-pointer"
              aria-expanded={showAdvanced}
            >
              <span>Advanced Settings</span>
              <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
            </button>

            {showAdvanced && (
              <div className="px-5 pb-5 space-y-5 border-t border-zinc-700/60 pt-4 animate-fade-in-up">
                {/* Temperature & Max Tokens */}
                <div className="grid grid-cols-2 gap-4">
                  <Slider
                    id="provider-temperature"
                    label="Temperature"
                    value={settings.provider.temperature}
                    min={0}
                    max={2}
                    step={0.1}
                    onChange={(v) => updateProvider({ temperature: v })}
                    formatValue={(v) => v.toFixed(1)}
                    minLabel="Precise"
                    maxLabel="Creative"
                  />
                  <Slider
                    id="provider-max-tokens"
                    label="Max Tokens"
                    value={settings.provider.maxTokens}
                    min={256}
                    max={16384}
                    step={256}
                    onChange={(v) => updateProvider({ maxTokens: v })}
                    minLabel="256"
                    maxLabel="16384"
                  />
                </div>

                {/* System Prompt */}
                <FieldGroup
                  label="System Prompt Template"
                  description="Customize translation instructions. Use {{targetLanguage}} and {{glossary}} variables."
                  htmlFor="provider-system-prompt"
                >
                  <textarea
                    id="provider-system-prompt"
                    value={settings.customSystemPrompt || DEFAULT_SYSTEM_PROMPT_TEMPLATE}
                    onChange={(e) => {
                      const val = e.target.value === DEFAULT_SYSTEM_PROMPT_TEMPLATE ? null : e.target.value;
                      updateSettings({ customSystemPrompt: val });
                    }}
                    rows={8}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono resize-y"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1">
                      {promptValidation && !promptValidation.valid && (
                        <div className="flex items-center gap-1 text-amber-400 text-xs">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>{promptValidation.warnings[0]}</span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<RotateCcw className="w-3 h-3" />}
                      onClick={() => updateSettings({ customSystemPrompt: null })}
                    >
                      Reset to Default
                    </Button>
                  </div>
                </FieldGroup>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
