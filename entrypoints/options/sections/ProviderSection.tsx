/**
 * Provider Settings Section — API config, test connection, system prompt editor.
 */

import { useState, useCallback } from 'react';
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle, RotateCcw, Eye, EyeOff,
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

export function ProviderSection() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const updateProvider = useSettingsStore((s) => s.updateProvider);

  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testProgress, setTestProgress] = useState<ConnectionTestStep[]>([]);
  const [isTesting, setIsTesting] = useState(false);

  const maskedKey = settings.provider.apiKey
    ? `${settings.provider.apiKey.slice(0, 4)}...${settings.provider.apiKey.slice(-4)}`
    : '';

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
  }, [settings.provider]);

  const promptValidation = settings.customSystemPrompt
    ? validatePromptTemplate(settings.customSystemPrompt)
    : null;

  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-100 mb-1">Translation Provider</h2>
      <p className="text-sm text-zinc-500 mb-8">Configure the LLM provider for translations.</p>

      <div className="space-y-6">
        {/* Provider Preset */}
        <FieldGroup label="Provider Preset">
          <select
            id="provider-preset"
            value={settings.provider.preset}
            onChange={(e) => handlePresetChange(e.target.value as ProviderPreset)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
          >
            {PROVIDER_PRESETS.map((p) => (
              <option key={p.preset} value={p.preset}>{p.displayName}</option>
            ))}
          </select>
        </FieldGroup>

        {/* Base URL */}
        <FieldGroup label="Base URL">
          <input
            id="provider-base-url"
            type="url"
            value={settings.provider.baseUrl}
            onChange={(e) => updateProvider({ baseUrl: e.target.value })}
            placeholder="https://api.example.com/v1"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono"
          />
        </FieldGroup>

        {/* API Key */}
        <FieldGroup label="API Key" description={settings.provider.requiresApiKey ? 'Required for this provider.' : 'Optional — leave blank for local providers.'}>
          <div className="relative">
            <input
              id="provider-api-key"
              type={showApiKey ? 'text' : 'password'}
              value={settings.provider.apiKey}
              onChange={(e) => updateProvider({ apiKey: e.target.value })}
              placeholder={PROVIDER_PRESETS.find((p) => p.preset === settings.provider.preset)?.placeholder ?? 'sk-...'}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 pr-10 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300"
              aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
            >
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {maskedKey && !showApiKey && (
            <p className="text-xs text-zinc-500 mt-1 font-mono">{maskedKey}</p>
          )}
        </FieldGroup>

        {/* Model */}
        <FieldGroup label="Model">
          <input
            id="provider-model"
            type="text"
            value={settings.provider.model}
            onChange={(e) => updateProvider({ model: e.target.value })}
            placeholder="model-name"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono"
          />
          {testResult && testResult.models.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-zinc-500 mb-1">Available models:</p>
              <div className="flex flex-wrap gap-1">
                {testResult.models.slice(0, 12).map((m) => (
                  <button
                    key={m}
                    onClick={() => updateProvider({ model: m })}
                    className={`text-xs px-2 py-0.5 rounded font-mono transition-colors ${
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

        {/* Temperature & Max Tokens */}
        <div className="grid grid-cols-2 gap-4">
          <FieldGroup label={`Temperature: ${settings.provider.temperature}`}>
            <input
              id="provider-temperature"
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={settings.provider.temperature}
              onChange={(e) => updateProvider({ temperature: parseFloat(e.target.value) })}
              className="w-full accent-blue-500"
            />
          </FieldGroup>
          <FieldGroup label={`Max Tokens: ${settings.provider.maxTokens}`}>
            <input
              id="provider-max-tokens"
              type="range"
              min="256"
              max="16384"
              step="256"
              value={settings.provider.maxTokens}
              onChange={(e) => updateProvider({ maxTokens: parseInt(e.target.value) })}
              className="w-full accent-blue-500"
            />
          </FieldGroup>
        </div>

        {/* Test Connection */}
        <div className="border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-200">Connection Test</h3>
            <button
              id="test-connection-btn"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm rounded-lg transition-colors"
            >
              {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isTesting ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          {/* Progress Steps */}
          {(testProgress.length > 0 || isTesting) && (
            <div className="space-y-2">
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

              {testResult && !testResult.overall && (
                <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
                  {testResult.steps.find((s) => !s.success)?.error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* System Prompt */}
        <FieldGroup label="System Prompt Template" description="Customize how translation instructions are sent to the LLM. Use {{targetLanguage}} and {{glossary}} variables.">
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
            <button
              onClick={() => updateSettings({ customSystemPrompt: null })}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset to Default
            </button>
          </div>
        </FieldGroup>
      </div>
    </div>
  );
}

function FieldGroup({ label, description, children }: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-200 mb-1">{label}</label>
      {description && <p className="text-xs text-zinc-500 mb-2">{description}</p>}
      {children}
    </div>
  );
}
