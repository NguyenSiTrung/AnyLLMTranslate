/**
 * Providers Section — multi-provider pool manager.
 *
 * Each provider is a collapsible card (displayName, baseUrl, model, catalog
 * picker, temperature/maxTokens, enabled toggle, delete, "+ Add key"). Each
 * key row has a masked apiKey input, optional label, maxRpm input, enabled
 * toggle, "Test" button, and a live status badge.
 *
 * Also includes a pool readiness banner and a global system-prompt template
 * editor (migrated from the legacy single-ProviderSection).
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Zap, Plus, Trash2, ChevronDown, KeyRound, Server, AlertTriangle,
  CheckCircle2, RotateCcw, Loader2, ChevronsDownUp, ChevronsUpDown,
  ExternalLink, FileText,
} from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import { poolIdGenerators } from '@/lib/config';
import { getCatalogEntryById, getKeyUrlForProvider, OPENAI_COMPATIBLE_CATALOG } from '@/lib/openAiCompatibleCatalog';
import { ProviderCatalogPicker, inferCatalogId } from '../components/ProviderCatalogPicker';
import { ConnectionTestProgressList } from '../components/ConnectionTestProgressList';
import { ModelPicker } from '../components/ModelPicker';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Toggle } from '@/ui/Toggle';
import { Badge } from '@/ui/Badge';
import { Slider } from '@/ui/Slider';
import { useToast } from '@/ui/ToastProvider';
import { Modal } from '@/ui/Modal';
import { EmptyState } from '@/ui/EmptyState';
import { getConnectionErrorMessage, getPoolReadinessStatus, getPoolRecoveryMessage } from '@/lib/providerReadiness';
import { applyProviderPatch, applyKeyPatch, formatTestResultAge } from '@/lib/poolTestStatus';
import {
  DEFAULT_SYSTEM_PROMPT_TEMPLATE,
  validatePromptTemplate,
} from '@/services/base';
import type {
  ExtensionSettings,
  PoolProvider,
  PoolKey,
  ProviderConfig,
  KeyTestResult,
} from '@/types/config';
import { testConnection } from '@/services/providerTester';
import type { ConnectionTestResult, ConnectionTestStep } from '@/services/providerTester';

interface ProvidersSectionProps {
  /** Called when the user clicks "Open setup guide" in the readiness banner. */
  onOpenSetup?: () => void;
  /** Optional: surface a message bus to query coordinator key status. When
   *  provided, each key row shows a live health badge. Omitted in tests. */
  getKeyStatus?: (keyId: string) => KeyStatusBadge | undefined;
}

export interface KeyStatusBadge {
  open: boolean;
  credentialInvalid: boolean;
  disabled: boolean;
  openUntil?: number;
}

export function ProvidersSection({ onOpenSetup }: ProvidersSectionProps = {}) {
  const settings = useSettingsStore();
  const providers = useSettingsStore((s) => s.providers);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const { success: showSuccess } = useToast();
  const [expandedProviderIds, setExpandedProviderIds] = useState<Set<string>>(new Set());
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isBulkTesting, setIsBulkTesting] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState(
    settings.customSystemPrompt ?? DEFAULT_SYSTEM_PROMPT_TEMPLATE,
  );

  // Sync draft when the prompt is reset to null externally (e.g. Reset button).
  useEffect(() => {
    if (settings.customSystemPrompt === null) {
      setDraftPrompt(DEFAULT_SYSTEM_PROMPT_TEMPLATE);
    }
  }, [settings.customSystemPrompt]);

  // Pool readiness banner
  const poolReadiness = getPoolReadinessStatus(settings);
  const recoveryMessage = getPoolRecoveryMessage(poolReadiness);
  const enabledKeyCount = countEnabledKeys(settings);

  /** Immutably update the providers array and persist. */
  const commitProviders = useCallback(
    (next: PoolProvider[]) => {
      updateSettings({ providers: next });
    },
    [updateSettings],
  );

  const updateProviderFields = useCallback(
    (providerId: string, patch: Partial<PoolProvider>) => {
      commitProviders(
        providers.map((p) => (p.id === providerId ? applyProviderPatch(p, patch) : p)),
      );
    },
    [providers, commitProviders],
  );

  const updateKey = useCallback(
    (providerId: string, keyId: string, patch: Partial<PoolKey>) => {
      commitProviders(
        providers.map((p) =>
          p.id === providerId
            ? {
                ...p,
                keys: p.keys.map((k) => (k.id === keyId ? applyKeyPatch(k, patch) : k)),
              }
            : p,
        ),
      );
    },
    [providers, commitProviders],
  );

  const addKey = useCallback(
    (providerId: string) => {
      const newKeyId = poolIdGenerators.keyId();
      const newKey: PoolKey = {
        id: newKeyId,
        apiKey: '',
        maxRpm: 0,
        enabled: true,
      };
      commitProviders(
        providers.map((p) =>
          p.id === providerId ? { ...p, keys: [...p.keys, newKey] } : p,
        ),
      );
      // Scroll the new key row into view after the DOM updates.
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-key-id="${newKeyId}"]`);
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    },
    [providers, commitProviders],
  );

  const removeKey = useCallback(
    (providerId: string, keyId: string) => {
      commitProviders(
        providers.map((p) =>
          p.id === providerId
            ? { ...p, keys: p.keys.filter((k) => k.id !== keyId) }
            : p,
        ),
      );
    },
    [providers, commitProviders],
  );

  const removeProvider = useCallback(
    (providerId: string) => {
      commitProviders(providers.filter((p) => p.id !== providerId));
      setExpandedProviderIds((prev) => {
        const next = new Set(prev);
        next.delete(providerId);
        return next;
      });
    },
    [providers, commitProviders],
  );

  const addProviderFromCatalog = useCallback(
    (catalogId: string) => {
      const entry = getCatalogEntryById(catalogId);
      const newProvider: PoolProvider = {
        id: poolIdGenerators.providerId(),
        displayName: entry?.displayName ?? 'Custom',
        baseUrl: entry?.baseUrl ?? '',
        model: entry?.defaultModel ?? '',
        requiresApiKey: entry?.requiresApiKey ?? true,
        catalogId,
        temperature: 0.3,
        maxTokens: 4096,
        requestTimeoutMs: 60000,
        enabled: true,
        keys: [{ id: poolIdGenerators.keyId(), apiKey: '', maxRpm: 0, enabled: true }],
      };
      commitProviders([...providers, newProvider]);
      setExpandedProviderIds((prev) => new Set(prev).add(newProvider.id));
      setShowAddProviderModal(false);
      showSuccess(`Added ${newProvider.displayName}`);
    },
    [providers, commitProviders, showSuccess],
  );

  /** Handle catalog picker selection for an existing provider. */
  const handleCatalogSelect = useCallback(
    (providerId: string, selection: { patch: Partial<ProviderConfig> }) => {
      updateProviderFields(providerId, {
        displayName: selection.patch.displayName,
        baseUrl: selection.patch.baseUrl,
        requiresApiKey: selection.patch.requiresApiKey,
        model: selection.patch.model,
        catalogId: inferCatalogId(selection.patch.baseUrl ?? ''),
      });
    },
    [updateProviderFields],
  );

  const expandAll = useCallback(() => {
    setExpandedProviderIds(new Set(providers.map((p) => p.id)));
  }, [providers]);

  const collapseAll = useCallback(() => {
    setExpandedProviderIds(new Set());
  }, []);

  /** Test all enabled (provider, key) pairs sequentially and aggregate results. */
  const handleTestAll = useCallback(async () => {
    const slots: { providerId: string; keyId: string; config: ProviderConfig }[] = [];
    for (const p of providers) {
      if (!p.enabled) continue;
      for (const k of p.keys) {
        if (!k.enabled) continue;
        if (p.requiresApiKey && !k.apiKey.trim()) continue;
        slots.push({
          providerId: p.id,
          keyId: k.id,
          config: buildProviderConfig(p, k),
        });
      }
    }
    if (slots.length === 0) return;

    setIsBulkTesting(true);
    let healthy = 0;
    const testResults: { providerId: string; keyId: string; result: KeyTestResult }[] = [];

    for (const slot of slots) {
      try {
        const result = await testConnection(slot.config, undefined, settings.targetLanguage);
        const keyResult: KeyTestResult = {
          success: result.overall,
          at: Date.now(),
          latencyMs: result.totalLatencyMs,
          error: result.overall ? undefined : result.steps.find((s) => !s.success)?.error,
        };
        testResults.push({ providerId: slot.providerId, keyId: slot.keyId, result: keyResult });
        if (result.overall) healthy++;
      } catch {
        testResults.push({
          providerId: slot.providerId,
          keyId: slot.keyId,
          result: { success: false, at: Date.now(), error: 'Test failed' },
        });
      }
    }

    // Write all results to the pool model.
    const resultsByKey = new Map(testResults.map((r) => [r.keyId, r.result]));
    commitProviders(
      providers.map((p) => ({
        ...p,
        keys: p.keys.map((k) =>
          resultsByKey.has(k.id) ? { ...k, lastTestResult: resultsByKey.get(k.id) } : k,
        ),
      })),
    );

    setIsBulkTesting(false);
    showSuccess(`Test complete: ${healthy}/${slots.length} key${slots.length !== 1 ? 's' : ''} healthy`);
  }, [providers, settings.targetLanguage, commitProviders, showSuccess]);

  const toggleProvider = useCallback((providerId: string) => {
    setExpandedProviderIds((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  }, []);

  const promptValidation = settings.customSystemPrompt
    ? validatePromptTemplate(settings.customSystemPrompt)
    : null;

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Providers"
        description="Manage multiple LLM providers and API keys. Requests rotate round-robin with automatic failover."
        icon={<Zap className="w-4 h-4" />}
        accentColor="amber"
      />

      {providers.length > 1 && (
        <div className="flex items-center gap-2 -mt-2">
          <Button size="sm" variant="ghost" icon={<ChevronsUpDown className="w-3.5 h-3.5" />} onClick={expandAll}>
            Expand all
          </Button>
          <Button size="sm" variant="ghost" icon={<ChevronsDownUp className="w-3.5 h-3.5" />} onClick={collapseAll}>
            Collapse all
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {/* Readiness banner */}
        <div className="animate-stagger" style={stagger(0)}>
          <Card variant="bordered" className={poolReadiness.canTranslate ? 'border-emerald-500/30' : 'border-amber-500/30'}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${poolReadiness.canTranslate ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                {poolReadiness.canTranslate ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-zinc-100">{recoveryMessage.title}</h3>
                <p className="text-xs text-zinc-400 mt-1 leading-5">{recoveryMessage.description}</p>
                <p className="text-xs text-zinc-500 mt-1">{recoveryMessage.action}</p>
                {enabledKeyCount > 0 && (
                  <p className="text-xs text-zinc-600 mt-0.5">{enabledKeyCount} enabled key{enabledKeyCount !== 1 ? 's' : ''} across {providers.length} provider{providers.length !== 1 ? 's' : ''}</p>
                )}
              </div>
              {onOpenSetup && (
                <Button size="sm" variant={poolReadiness.canTranslate ? 'secondary' : 'primary'} onClick={onOpenSetup}>
                  Open setup guide
                </Button>
              )}
              {enabledKeyCount > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={isBulkTesting}
                  icon={!isBulkTesting ? <Zap className="w-3.5 h-3.5" /> : undefined}
                  onClick={handleTestAll}
                >
                  {isBulkTesting ? 'Testing...' : 'Test all keys'}
                </Button>
              )}
            </div>
          </Card>
        </div>

        {providers.length === 0 && (
          <div className="animate-stagger" style={stagger(1)}>
            <Card variant="bordered">
              <EmptyState
                icon={<Server className="w-8 h-8" />}
                message="No providers configured. Add one to start translating."
                actionLabel="Add provider from catalog"
                onAction={() => setShowAddProviderModal(true)}
              />
            </Card>
          </div>
        )}

        {providers.map((provider, idx) => {
          const isExpanded = expandedProviderIds.has(provider.id);
          const panelId = `provider-panel-${provider.id}`;
          const headerId = `provider-header-${provider.id}`;
          const catalogId = provider.catalogId ?? inferCatalogId(provider.baseUrl);
          return (
            <div key={provider.id} className="animate-stagger" style={stagger(idx + 1)}>
              <Card variant="bordered" className="p-0 overflow-hidden">
                {/* Provider header (collapsible) */}
                <button
                  type="button"
                  id={headerId}
                  onClick={() => toggleProvider(provider.id)}
                  className={`w-full flex items-center justify-between px-5 py-4 text-sm font-medium transition-colors cursor-pointer ${
                    provider.enabled
                      ? 'text-zinc-300 hover:bg-zinc-800/50'
                      : 'text-zinc-500 hover:bg-zinc-800/30 opacity-60'
                  }`}
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Server className={`w-3.5 h-3.5 shrink-0 ${provider.enabled ? 'text-zinc-500' : 'text-zinc-600'}`} />
                    <span className="truncate">{provider.displayName || 'Unnamed provider'}</span>
                    <Badge variant={provider.enabled ? 'success' : 'info'}>
                      {provider.enabled ? 'on' : 'off'}
                    </Badge>
                    <span className="flex items-center gap-0.5 text-xs text-zinc-500">
                      <KeyRound className="w-3 h-3" />
                      {provider.keys.length}
                    </span>
                    {(() => {
                      const status = getProviderTestStatus(provider);
                      if (status.state === 'untested') return null;
                      const color = status.state === 'healthy' ? 'bg-emerald-500' : 'bg-red-500';
                      const label = status.state === 'healthy' ? 'Verified' : 'Failed';
                      const age = status.result ? formatTestResultAge(status.result) : '';
                      return (
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${color}`}
                          title={`${label}${age ? ` (${age})` : ''}`}
                          aria-label={`${label}${age ? ` ${age}` : ''}`}
                        />
                      );
                    })()}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {isExpanded && (
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={headerId}
                    className="px-5 pb-5 space-y-5 border-t border-zinc-700/60 pt-4"
                  >
                    {/* Enabled toggle + delete */}
                    <div className="flex items-center justify-between gap-4 pt-3">
                      <label className="flex items-center gap-3 cursor-pointer select-none group">
                        <Toggle
                          checked={provider.enabled}
                          onChange={(enabled) => updateProviderFields(provider.id, { enabled })}
                        />
                        <div>
                          <span className={`text-sm font-medium transition-colors ${
                            provider.enabled ? 'text-zinc-100' : 'text-zinc-500'
                          }`}>
                            {provider.enabled ? 'Provider enabled' : 'Provider disabled'}
                          </span>
                          <p className="text-xs text-zinc-600 mt-0.5">
                            {provider.enabled ? 'Included in the rotation pool' : 'Excluded from all requests'}
                          </p>
                        </div>
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 className="w-3.5 h-3.5" />}
                        onClick={() => setPendingDeleteId(provider.id)}
                      >
                        Remove provider
                      </Button>
                    </div>

                    {/* Catalog picker for switching provider template */}
                    <ProviderCatalogPicker
                      compact
                      selectedCatalogId={catalogId}
                      provider={{
                        baseUrl: provider.baseUrl,
                        apiKey: provider.keys[0]?.apiKey ?? '',
                        model: provider.model,
                      }}
                      onSelect={(selection) => handleCatalogSelect(provider.id, selection)}
                    />

                    <FieldGroup label="Display name" htmlFor={`pn-${provider.id}`}>
                      <Input
                        id={`pn-${provider.id}`}
                        value={provider.displayName}
                        onChange={(e) => updateProviderFields(provider.id, { displayName: e.target.value })}
                        placeholder="OpenAI"
                      />
                    </FieldGroup>

                    <FieldGroup label="Base URL" htmlFor={`pu-${provider.id}`}>
                      <Input
                        id={`pu-${provider.id}`}
                        type="url"
                        value={provider.baseUrl}
                        onChange={(e) => updateProviderFields(provider.id, { baseUrl: e.target.value })}
                        placeholder="https://api.openai.com/v1"
                        className="font-mono"
                      />
                    </FieldGroup>

                    {/* Keys — placed before model picker so Browse models can use credentials */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase tracking-widest text-zinc-600">API Keys</span>
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Plus className="w-3.5 h-3.5" />}
                          onClick={() => addKey(provider.id)}
                        >
                          Add key
                        </Button>
                      </div>
                      {provider.keys.map((key) => (
                        <KeyRow
                          key={key.id}
                          provider={provider}
                          poolKey={key}
                          targetLanguage={settings.targetLanguage}
                          onUpdate={(patch) => updateKey(provider.id, key.id, patch)}
                          onRemove={() => removeKey(provider.id, key.id)}
                        />
                      ))}
                    </div>

                    <ModelPicker
                      inputId={`pm-${provider.id}`}
                      provider={buildProviderConfig(provider, getCredentialKey(provider) ?? provider.keys[0] ?? {
                        id: '',
                        apiKey: '',
                        maxRpm: 0,
                        enabled: true,
                      })}
                      onModelChange={(model) => updateProviderFields(provider.id, { model })}
                    />

                    {/* Temperature & Max Tokens */}
                    <div className="grid grid-cols-2 gap-4">
                      <Slider
                        id={`pt-${provider.id}`}
                        label="Temperature"
                        value={provider.temperature}
                        min={0}
                        max={2}
                        step={0.1}
                        onChange={(v) => updateProviderFields(provider.id, { temperature: v })}
                        formatValue={(v) => v.toFixed(1)}
                        minLabel="Precise"
                        maxLabel="Creative"
                      />
                      <Slider
                        id={`pmt-${provider.id}`}
                        label="Max Tokens"
                        value={provider.maxTokens}
                        min={256}
                        max={16384}
                        step={256}
                        onChange={(v) => updateProviderFields(provider.id, { maxTokens: v })}
                        minLabel="256"
                        maxLabel="16384"
                      />
                    </div>

                    <ProviderConnectionTest
                      provider={provider}
                      targetLanguage={settings.targetLanguage}
                      onTestComplete={(result) => updateProviderFields(provider.id, { lastTestResult: result })}
                    />
                  </div>
                )}
              </Card>
            </div>
          );
        })}

        {/* Add provider entry point */}
        <div className="animate-stagger" style={stagger(providers.length + 1)}>
          <Button
            variant="secondary"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setShowAddProviderModal(true)}
          >
            Add provider from catalog
          </Button>
        </div>

        {/* System Prompt Template (global setting) */}
        <div className="animate-stagger" style={stagger(providers.length + 2)}>
          <Card title="Global System Prompt (advanced)" icon={<FileText className="w-3.5 h-3.5" />} variant="bordered">
            <FieldGroup
              label="Custom prompt template"
              description="Customize translation instructions. Use {{targetLanguage}} and {{glossary}} variables."
              htmlFor="providers-system-prompt"
            >
              <textarea
                id="providers-system-prompt"
                value={draftPrompt}
                onChange={(e) => {
                  const val = e.target.value;
                  setDraftPrompt(val);
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
          </Card>
        </div>
      </div>

      {/* Add-provider modal */}
      {showAddProviderModal && (
        <AddProviderModal
          onPick={addProviderFromCatalog}
          onClose={() => setShowAddProviderModal(false)}
        />
      )}

      {/* Delete-provider confirmation */}
      {pendingDeleteId && (
        <Modal
          title="Remove provider?"
          message="This will remove the provider and all its API keys. This cannot be undone."
          confirmLabel="Remove"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={() => {
            removeProvider(pendingDeleteId);
            setPendingDeleteId(null);
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}

function getCredentialKey(provider: PoolProvider): PoolKey | undefined {
  return provider.keys.find((k) => !provider.requiresApiKey || k.apiKey.trim());
}

function buildProviderConfig(provider: PoolProvider, key: PoolKey): ProviderConfig {
  return {
    preset: 'custom',
    baseUrl: provider.baseUrl,
    apiKey: key.apiKey,
    model: provider.model,
    temperature: provider.temperature,
    maxTokens: provider.maxTokens,
    displayName: provider.displayName,
    requiresApiKey: provider.requiresApiKey,
    requestTimeoutMs: provider.requestTimeoutMs,
    maxRpm: key.maxRpm,
  };
}

function canRunConnectionTest(provider: PoolProvider, key?: PoolKey): boolean {
  if (!provider.baseUrl.trim() || !provider.model.trim()) return false;
  if (key) {
    return !provider.requiresApiKey || Boolean(key.apiKey.trim());
  }
  return provider.keys.some((k) => !provider.requiresApiKey || Boolean(k.apiKey.trim()));
}

/** Aggregate test status for a provider from its keys' lastTestResult. */
function getProviderTestStatus(provider: PoolProvider): { state: 'healthy' | 'failed' | 'untested'; result?: KeyTestResult } {
  const testedKeys = provider.keys.filter((k) => k.lastTestResult);
  if (testedKeys.length === 0 && !provider.lastTestResult) {
    return { state: 'untested' };
  }
  const anySuccess = testedKeys.some((k) => k.lastTestResult?.success);
  const allFailed = testedKeys.length > 0 && testedKeys.every((k) => k.lastTestResult?.success === false);
  if (anySuccess) {
    return { state: 'healthy', result: testedKeys.find((k) => k.lastTestResult?.success)?.lastTestResult };
  }
  if (allFailed) {
    return { state: 'failed', result: testedKeys[0]?.lastTestResult };
  }
  return { state: 'untested' };
}

function useConnectionTest(targetLanguage: string) {
  const { success: showSuccess, error: showError } = useToast();
  const [isTesting, setIsTesting] = useState(false);
  const [testProgress, setTestProgress] = useState<ConnectionTestStep[]>([]);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  const runTest = useCallback(async (config: ProviderConfig, successLabel: string) => {
    setIsTesting(true);
    setTestResult(null);
    setTestProgress([]);

    const result = await testConnection(config, (step) => {
      setTestProgress((prev) => [...prev, step]);
    }, targetLanguage);

    setTestResult(result);
    setIsTesting(false);

    if (result.overall) {
      showSuccess(successLabel);
    } else {
      const failed = result.steps.find((s) => !s.success);
      const message = getConnectionErrorMessage(failed?.error);
      showError(`${message.title}: ${message.action}`);
    }

    return result;
  }, [showSuccess, showError, targetLanguage]);

  return { isTesting, testProgress, testResult, runTest };
}

/** Provider-level connection test using the first key with credentials. */
function ProviderConnectionTest({
  provider,
  targetLanguage,
  onTestComplete,
}: {
  provider: PoolProvider;
  targetLanguage: string;
  onTestComplete?: (result: KeyTestResult) => void;
}) {
  const { isTesting, testProgress, testResult, runTest } = useConnectionTest(targetLanguage);
  const testKey = getCredentialKey(provider);
  const canTest = testKey ? canRunConnectionTest(provider, testKey) : false;
  const failedStep = testResult?.steps.find((s) => !s.success);
  const failedMessage = getConnectionErrorMessage(failedStep?.error);

  const handleTest = async () => {
    if (!testKey) return;
    const result = await runTest(buildProviderConfig(provider, testKey), `${provider.displayName || 'Provider'} connection verified`);
    onTestComplete?.({
      success: result.overall,
      at: Date.now(),
      latencyMs: result.totalLatencyMs,
      error: result.overall ? undefined : failedStep?.error,
    });
  };

  return (
    <div className="rounded-lg border border-zinc-700/60 p-4 space-y-3 bg-zinc-900/30">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-200">Test connection</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Validates reachability, model listing, and a sample translation.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          loading={isTesting}
          disabled={!canTest}
          icon={!isTesting ? <Zap className="w-3.5 h-3.5" /> : undefined}
          onClick={handleTest}
        >
          {isTesting ? 'Testing...' : 'Test'}
        </Button>
      </div>
      {!canTest && (
        <p className="text-xs text-zinc-500">
          Add a base URL, model, and API key before testing.
        </p>
      )}
      <ConnectionTestProgressList steps={testProgress} isTesting={isTesting} />
      {isTesting && testProgress.length === 0 && (
        <p className="text-xs text-zinc-400">
          <Loader2 className="inline w-3.5 h-3.5 animate-spin mr-1.5" />
          Starting connection test...
        </p>
      )}
      {testResult?.overall && (
        <p className="text-xs text-emerald-400 font-medium">Connection successful.</p>
      )}
      {testResult && !testResult.overall && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
          <p className="text-xs font-medium text-red-300">{failedMessage.title}</p>
          <p className="text-xs text-red-200/80 mt-1">{failedMessage.action}</p>
        </div>
      )}
    </div>
  );
}

/** A single API key row within a provider. */
function KeyRow({
  provider,
  poolKey,
  targetLanguage,
  onUpdate,
  onRemove,
}: {
  provider: PoolProvider;
  poolKey: PoolKey;
  targetLanguage: string;
  onUpdate: (patch: Partial<PoolKey>) => void;
  onRemove: () => void;
}) {
  const [maxRpmDraft, setMaxRpmDraft] = useState(String(poolKey.maxRpm));
  const { isTesting, testProgress, testResult, runTest } = useConnectionTest(targetLanguage);
  const canTest = canRunConnectionTest(provider, poolKey);
  const failedStep = testResult?.steps.find((s) => !s.success);
  const failedMessage = getConnectionErrorMessage(failedStep?.error);

  const catalogId = provider.catalogId ?? inferCatalogId(provider.baseUrl);
  const catalogEntry = getCatalogEntryById(catalogId);
  const keyPlaceholder = catalogEntry?.placeholder ?? 'sk-...';
  const getKeyUrl = getKeyUrlForProvider(provider.baseUrl);

  const handleTest = async () => {
    const result = await runTest(
      buildProviderConfig(provider, poolKey),
      `Key "${poolKey.label || 'key'}" is healthy`,
    );
    onUpdate({
      lastTestResult: {
        success: result.overall,
        at: Date.now(),
        latencyMs: result.totalLatencyMs,
        error: result.overall ? undefined : result.steps.find((s) => !s.success)?.error,
      },
    });
  };

  const commitMaxRpm = () => {
    const n = Math.max(0, Math.min(600, Math.floor(Number(maxRpmDraft) || 0)));
    setMaxRpmDraft(String(n));
    if (n !== poolKey.maxRpm) onUpdate({ maxRpm: n });
  };

  return (
    <div data-key-id={poolKey.id} className="rounded-lg border border-zinc-700/60 p-4 space-y-4 bg-zinc-900/40">
      <div className="flex items-center gap-2">
        <KeyRound className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span className="text-xs text-zinc-400 font-mono">{poolKey.label || poolKey.id}</span>
        <Badge variant={poolKey.enabled ? 'success' : 'info'}>
          {poolKey.enabled ? 'on' : 'off'}
        </Badge>
      </div>

      {provider.requiresApiKey ? (
        <FieldGroup label="API key" htmlFor={`pk-${poolKey.id}`}>
          <Input
            id={`pk-${poolKey.id}`}
            type="password"
            value={poolKey.apiKey}
            onChange={(e) => onUpdate({ apiKey: e.target.value })}
            placeholder={keyPlaceholder}
            className="font-mono"
          />
          {getKeyUrl && (
            <a
              href={getKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1"
            >
              Get a key <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </FieldGroup>
      ) : (
        <div className="rounded-lg border border-zinc-700/40 bg-zinc-800/30 px-3 py-2">
          <p className="text-xs text-zinc-500">No key required for this provider</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <FieldGroup label="Label (optional)" htmlFor={`pl-${poolKey.id}`}>
          <Input
            id={`pl-${poolKey.id}`}
            value={poolKey.label ?? ''}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder="prod / staging"
          />
        </FieldGroup>
        <FieldGroup label="Max RPM (0 = unlimited)" htmlFor={`pr-${poolKey.id}`}>
          <Input
            id={`pr-${poolKey.id}`}
            type="number"
            min={0}
            max={600}
            value={maxRpmDraft}
            onChange={(e) => setMaxRpmDraft(e.target.value)}
            onBlur={commitMaxRpm}
            hint="Cap is 600 RPM; 0 = unlimited"
          />
        </FieldGroup>
      </div>

      <div className="flex items-center justify-between gap-4 pt-3 border-t border-zinc-700/40">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <Toggle
            checked={poolKey.enabled}
            onChange={(enabled) => onUpdate({ enabled })}
          />
          <span className={`text-sm font-medium transition-colors ${
            poolKey.enabled ? 'text-zinc-200' : 'text-zinc-500'
          }`}>
            {poolKey.enabled ? 'Key active' : 'Key disabled'}
          </span>
        </label>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={isTesting}
            disabled={!canTest}
            onClick={handleTest}
          >
            {isTesting ? 'Testing...' : 'Test'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
      </div>

      {provider.requiresApiKey && !canTest && !isTesting && (
        <p className="text-xs text-zinc-500">
          Enter an API key to test this key.
        </p>
      )}

      <ConnectionTestProgressList steps={testProgress} isTesting={isTesting} />
      {testResult && !testResult.overall && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
          <p className="text-xs font-medium text-red-300">{failedMessage.title}</p>
          <p className="text-xs text-red-200/80 mt-1">{failedMessage.action}</p>
        </div>
      )}
      {testResult?.overall && (
        <p className="text-xs text-emerald-400 font-medium">Key connection successful.</p>
      )}
    </div>
  );
}

/** Modal listing catalog entries to add as a new provider. */
function AddProviderModal({
  onPick,
  onClose,
}: {
  onPick: (catalogId: string) => void;
  onClose: () => void;
}) {
  // The catalog list is rendered as the Modal's `message` body.
  const catalogBody = (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {OPENAI_COMPATIBLE_CATALOG.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => onPick(entry.id)}
          className="w-full flex items-center justify-between p-3 rounded-lg border border-zinc-700/60 hover:bg-zinc-800/50 transition-colors text-left"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-200 truncate">{entry.displayName}</p>
            <p className="text-xs text-zinc-500 font-mono truncate">{entry.baseUrl}</p>
          </div>
          <Plus className="w-4 h-4 text-zinc-500 shrink-0" />
        </button>
      ))}
    </div>
  );
  return (
    <Modal
      title="Add provider from catalog"
      message={catalogBody}
      confirmLabel="Done"
      cancelLabel="Cancel"
      onConfirm={onClose}
      onCancel={onClose}
    />
  );
}

/** Helper: count enabled keys across the pool (for readiness aggregation). */
export function countEnabledKeys(settings: ExtensionSettings): number {
  let n = 0;
  for (const p of settings.providers ?? []) {
    if (!p.enabled) continue;
    for (const k of p.keys ?? []) {
      if (k.enabled && k.apiKey) n++;
    }
  }
  return n;
}

/** Helper: aggregate pool readiness for the popup. */
export function getPoolReadiness(settings: ExtensionSettings): {
  status: 'not-configured' | 'ready' | 'partial';
  enabledKeyCount: number;
} {
  const enabledKeyCount = countEnabledKeys(settings);
  if ((settings.providers ?? []).length === 0 || enabledKeyCount === 0) {
    return { status: 'not-configured', enabledKeyCount };
  }
  return { status: 'ready', enabledKeyCount };
}
