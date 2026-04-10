/**
 * Provider Settings Section — API config, test connection, system prompt editor.
 * Refactored with shared components, accordion, and progress bar.
 */

import { useState, useCallback } from 'react';
import {
  Loader2, CheckCircle2, XCircle, RotateCcw,
  Zap, ChevronDown, AlertTriangle,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { PROVIDER_PRESETS } from '@/types/config';
import type { ProviderPreset } from '@/types/config';
import { testConnection } from '@/services/providerTester';
import type { ConnectionTestResult, ConnectionTestStep } from '@/services/providerTester';
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

export function ProviderSection() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const updateProvider = useSettingsStore((s) => s.updateProvider);
  const { error: showError, success: showSuccess } = useToast();

  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testProgress, setTestProgress] = useState<ConnectionTestStep[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handlePresetChange = useCallback((preset: ProviderPreset) => {
    const presetDef = PROVIDER_PRESETS.find((p) => p.preset === preset);
    if (presetDef) {
      updateProvider({
        preset,
        baseUrl: presetDef.baseUrl,
        model: presetDef.defaultModel,
        displayName: presetDef.displayName,
        requiresApiKey: presetDef.requiresApiKey,
      });
    }
  }, [updateProvider]);

  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    setTestResult(null);
    setTestProgress([]);

    const result = await testConnection(settings.provider, (step) => {
      setTestProgress((prev) => [...prev, step]);
    });

    setTestResult(result);
    setIsTesting(false);

    if (result.overall) {
      showSuccess('Connection test passed! All checks successful.');
    } else {
      const failedStep = result.steps.find((s) => !s.success);
      showError(`Connection test failed: ${failedStep?.error ?? 'Unknown error'}`);
    }
  }, [settings.provider, showSuccess, showError]);

  const promptValidation = settings.customSystemPrompt
    ? validatePromptTemplate(settings.customSystemPrompt)
    : null;

  const completedSteps = testProgress.filter((s) => s.success).length;
  const totalSteps = 3;
  const progressPct = (completedSteps / totalSteps) * 100;

  return (
    <div className="animate-fade-in-up">
      {/* Section header */}
      <Card accent="blue" className="mb-8">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Translation Provider</h2>
            <p className="text-xs text-zinc-500">Configure the LLM provider for translations.</p>
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        {/* Essential fields */}
        <Card title="Provider Configuration" variant="bordered">
          <div className="space-y-4">
            {/* Provider Preset — visual cards */}
            <FieldGroup label="Provider Preset">
              <div className="grid grid-cols-2 gap-2">
                {PROVIDER_PRESETS.map((p) => {
                  const isActive = settings.provider.preset === p.preset;
                  return (
                    <button
                      key={p.preset}
                      onClick={() => handlePresetChange(p.preset)}
                      className={`text-left p-3 rounded-lg border transition-all duration-150 cursor-pointer ${
                        isActive
                          ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
                          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800/50'
                      }`}
                    >
                      <p className={`text-sm font-medium ${isActive ? 'text-blue-400' : 'text-zinc-200'}`}>
                        {p.displayName}
                      </p>
                      <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{p.baseUrl}</p>
                    </button>
                  );
                })}
              </div>
            </FieldGroup>

            {/* Base URL */}
            <FieldGroup label="Base URL" htmlFor="provider-base-url">
              <Input
                id="provider-base-url"
                type="url"
                value={settings.provider.baseUrl}
                onChange={(e) => updateProvider({ baseUrl: e.target.value })}
                placeholder="https://api.example.com/v1"
                className="font-mono"
              />
            </FieldGroup>

            {/* API Key */}
            <FieldGroup
              label="API Key"
              description={settings.provider.requiresApiKey ? 'Required for this provider.' : 'Optional — leave blank for local providers.'}
              htmlFor="provider-api-key"
            >
              <Input
                id="provider-api-key"
                type="password"
                value={settings.provider.apiKey}
                onChange={(e) => updateProvider({ apiKey: e.target.value })}
                placeholder={PROVIDER_PRESETS.find((p) => p.preset === settings.provider.preset)?.placeholder ?? 'sk-...'}
                className="font-mono"
              />
            </FieldGroup>

            {/* Model */}
            <FieldGroup label="Model" htmlFor="provider-model">
              <Input
                id="provider-model"
                type="text"
                value={settings.provider.model}
                onChange={(e) => updateProvider({ model: e.target.value })}
                placeholder="model-name"
                className="font-mono"
              />
              {testResult && testResult.models.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-zinc-500 mb-1">Available models:</p>
                  <div className="flex flex-wrap gap-1">
                    {testResult.models.slice(0, 12).map((m) => (
                      <button
                        key={m}
                        onClick={() => updateProvider({ model: m })}
                        className={`text-xs px-2 py-0.5 rounded font-mono transition-colors cursor-pointer ${
                          settings.provider.model === m
                            ? 'bg-blue-600 text-white'
                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </FieldGroup>
          </div>
        </Card>

        {/* Connection Test */}
        <Card title="Connection Test" variant="bordered">
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
                  const labels = { ping: 'API Ping', models: 'Model Listing', translation: 'Translation Test' };
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
                        {labels[stepName]}
                      </span>
                      {step && (
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

        {/* Advanced accordion */}
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800/50 transition-colors cursor-pointer"
            aria-expanded={showAdvanced}
          >
            <span>Advanced Settings</span>
            <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>

          {showAdvanced && (
            <div className="px-4 pb-4 space-y-4 animate-fade-in-up">
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
                description="Customize how translation instructions are sent to the LLM. Use {{targetLanguage}} and {{glossary}} variables."
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
        </div>
      </div>
    </div>
  );
}
