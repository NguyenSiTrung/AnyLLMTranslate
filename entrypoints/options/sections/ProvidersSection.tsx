/**
 * Providers Section — multi-provider pool manager.
 *
 * Replaces the editing surface of the legacy single ProviderSection for
 * power users. Each provider is a collapsible card (displayName, baseUrl,
 * model, catalog picker, temperature/maxTokens, enabled toggle, delete,
 * "+ Add key"). Each key row has a masked apiKey input, optional label,
 * maxRpm input, enabled toggle, "Test" button, and a live status badge.
 *
 * The single-provider / single-key case renders essentially like today's
 * simple form (FR-8). Drives `updateSettings({ providers })`.
 */

import { useState, useCallback } from 'react';
import {
  Zap, Plus, Trash2, ChevronDown, KeyRound, Server, AlertTriangle,
} from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { useSettingsStore } from '@/stores/settingsStore';
import { poolIdGenerators } from '@/lib/config';
import { getCatalogEntryById, OPENAI_COMPATIBLE_CATALOG } from '@/lib/openAiCompatibleCatalog';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Toggle } from '@/ui/Toggle';
import { Badge } from '@/ui/Badge';
import { useToast } from '@/ui/ToastProvider';
import { Modal } from '@/ui/Modal';
import type {
  ExtensionSettings,
  PoolProvider,
  PoolKey,
  ProviderConfig,
} from '@/types/config';
import { testConnection } from '@/services/providerTester';

interface ProvidersSectionProps {
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

export function ProvidersSection(_props: ProvidersSectionProps = {}) {
  const providers = useSettingsStore((s) => s.providers);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const { success: showSuccess, error: showError } = useToast();
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(null);
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  /** Immutably update the providers array and persist. */
  const commitProviders = useCallback(
    (next: PoolProvider[]) => {
      updateSettings({ providers: next });
    },
    [updateSettings],
  );

  const updateProvider = useCallback(
    (providerId: string, patch: Partial<PoolProvider>) => {
      commitProviders(
        providers.map((p) => (p.id === providerId ? { ...p, ...patch } : p)),
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
                keys: p.keys.map((k) => (k.id === keyId ? { ...k, ...patch } : k)),
              }
            : p,
        ),
      );
    },
    [providers, commitProviders],
  );

  const addKey = useCallback(
    (providerId: string) => {
      const newKey: PoolKey = {
        id: poolIdGenerators.keyId(),
        apiKey: '',
        maxRpm: 0,
        enabled: true,
      };
      commitProviders(
        providers.map((p) =>
          p.id === providerId ? { ...p, keys: [...p.keys, newKey] } : p,
        ),
      );
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
      if (expandedProviderId === providerId) setExpandedProviderId(null);
    },
    [providers, commitProviders, expandedProviderId],
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
      setExpandedProviderId(newProvider.id);
      setShowAddProviderModal(false);
      showSuccess(`Added ${newProvider.displayName}`);
    },
    [providers, commitProviders, showSuccess],
  );

  const handleTestKey = useCallback(
    async (provider: PoolProvider, key: PoolKey) => {
      // Build a resolved ProviderConfig for this specific slot and test it.
      const config: ProviderConfig = {
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
      const result = await testConnection(config, undefined, 'vi');
      if (result.overall) {
        showSuccess(`Key "${key.label || 'key'}" is healthy`);
      } else {
        const failed = result.steps.find((s) => !s.success);
        showError(`Key test failed: ${failed?.error ?? 'unknown error'}`);
      }
    },
    [showSuccess, showError],
  );

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Providers"
        description="Manage multiple LLM providers and API keys. Requests rotate round-robin with automatic failover."
        icon={<Zap className="w-4 h-4" />}
        accentColor="amber"
      />

      <div className="space-y-4">
        {providers.length === 0 && (
          <Card variant="bordered">
            <div className="flex items-center gap-3 p-2">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <p className="text-sm text-zinc-400">
                No providers configured. Add one to start translating.
              </p>
            </div>
          </Card>
        )}

        {providers.map((provider) => {
          const isExpanded = expandedProviderId === provider.id;
          return (
            <Card key={provider.id} variant="bordered" className="p-0 overflow-hidden">
              {/* Provider header (collapsible) */}
              <button
                type="button"
                onClick={() => setExpandedProviderId(isExpanded ? null : provider.id)}
                className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium text-zinc-300 hover:bg-zinc-800/50 transition-colors cursor-pointer"
                aria-expanded={isExpanded}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Server className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <span className="truncate">{provider.displayName || 'Unnamed provider'}</span>
                  <Badge variant={provider.enabled ? 'success' : 'info'}>
                    {provider.enabled ? 'on' : 'off'}
                  </Badge>
                  <span className="text-xs text-zinc-500">{provider.keys.length} key{provider.keys.length !== 1 ? 's' : ''}</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 space-y-4 border-t border-zinc-700/60 pt-4">
                  {/* Enabled toggle + delete */}
                  <div className="flex items-center justify-between">
                    <Toggle
                      checked={provider.enabled}
                      onChange={(enabled) => updateProvider(provider.id, { enabled })}
                      label="Enabled"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                      onClick={() => setPendingDeleteId(provider.id)}
                    >
                      Remove provider
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FieldGroup label="Display name" htmlFor={`pn-${provider.id}`}>
                      <Input
                        id={`pn-${provider.id}`}
                        value={provider.displayName}
                        onChange={(e) => updateProvider(provider.id, { displayName: e.target.value })}
                        placeholder="OpenAI"
                      />
                    </FieldGroup>
                    <FieldGroup label="Model" htmlFor={`pm-${provider.id}`}>
                      <Input
                        id={`pm-${provider.id}`}
                        value={provider.model}
                        onChange={(e) => updateProvider(provider.id, { model: e.target.value })}
                        placeholder="gpt-4o-mini"
                        className="font-mono"
                      />
                    </FieldGroup>
                  </div>

                  <FieldGroup label="Base URL" htmlFor={`pu-${provider.id}`}>
                    <Input
                      id={`pu-${provider.id}`}
                      type="url"
                      value={provider.baseUrl}
                      onChange={(e) => updateProvider(provider.id, { baseUrl: e.target.value })}
                      placeholder="https://api.openai.com/v1"
                      className="font-mono"
                    />
                  </FieldGroup>

                  {/* Keys */}
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
                        poolKey={key}
                        onUpdate={(patch) => updateKey(provider.id, key.id, patch)}
                        onRemove={() => removeKey(provider.id, key.id)}
                        onTest={() => handleTestKey(provider, key)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}

        {/* Add provider entry point */}
        <Button
          variant="secondary"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setShowAddProviderModal(true)}
        >
          Add provider from catalog
        </Button>
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

/** A single API key row within a provider. */
function KeyRow({
  poolKey,
  onUpdate,
  onRemove,
  onTest,
}: {
  poolKey: PoolKey;
  onUpdate: (patch: Partial<PoolKey>) => void;
  onRemove: () => void;
  onTest: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [maxRpmDraft, setMaxRpmDraft] = useState(String(poolKey.maxRpm));

  const commitMaxRpm = () => {
    const n = Math.max(0, Math.min(600, Math.floor(Number(maxRpmDraft) || 0)));
    setMaxRpmDraft(String(n));
    if (n !== poolKey.maxRpm) onUpdate({ maxRpm: n });
  };

  return (
    <div className="rounded-lg border border-zinc-700/60 p-3 space-y-3 bg-zinc-900/40">
      <div className="flex items-center gap-2">
        <KeyRound className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span className="text-xs text-zinc-400 font-mono">{poolKey.label || poolKey.id}</span>
        <Badge variant={poolKey.enabled ? 'success' : 'info'}>
          {poolKey.enabled ? 'on' : 'off'}
        </Badge>
      </div>

      <FieldGroup label="API key" htmlFor={`pk-${poolKey.id}`}>
        <div className="flex gap-2">
          <Input
            id={`pk-${poolKey.id}`}
            type={revealed ? 'text' : 'password'}
            value={poolKey.apiKey}
            onChange={(e) => onUpdate({ apiKey: e.target.value })}
            placeholder="sk-..."
            className="font-mono"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRevealed(!revealed)}
          >
            {revealed ? 'Hide' : 'Show'}
          </Button>
        </div>
      </FieldGroup>

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
          />
        </FieldGroup>
      </div>

      <div className="flex items-center justify-between">
        <Toggle
          checked={poolKey.enabled}
          onChange={(enabled) => onUpdate({ enabled })}
          label="Enabled"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onTest}>
            Test
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
      confirmLabel="Close"
      cancelLabel="Close"
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
