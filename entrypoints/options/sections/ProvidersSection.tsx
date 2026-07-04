/**
 * Providers Section — multi-provider pool manager (orchestrator only).
 *
 * Owns the pool readiness banner, the empty state, expand/collapse-all, the
 * per-provider card list (rendered via {@link ProviderCard}), the add-provider
 * modal, the delete-provider confirmation, and the global system-prompt
 * template editor. All per-provider / per-key UI was extracted into
 * `entrypoints/options/components/` (FR-1).
 *
 * Public API invariant: the default export's prop signature and the
 * `countEnabledKeys` / `getPoolReadiness` re-exports MUST stay stable — the
 * popup imports the helpers and existing tests target the props.
 */

import { useState, useCallback } from 'react';
import {
  Zap, Plus, Server, AlertTriangle,
  CheckCircle2, ChevronsDownUp, ChevronsUpDown, ArrowRight,
} from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import { poolIdGenerators } from '@/lib/config';
import { getCatalogEntryById } from '@/lib/openAiCompatibleCatalog';
import { inferCatalogId } from '../components/ProviderCatalogPicker';
import { ProviderCard } from '../components/ProviderCard';
import { AddProviderModal } from '../components/AddProviderModal';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { useToast } from '@/ui/ToastProvider';
import { Modal } from '@/ui/Modal';
import { EmptyState } from '@/ui/EmptyState';
import { getPoolReadinessStatus, getPoolRecoveryMessage } from '@/lib/providerReadiness';
import { applyProviderPatch, applyKeyPatch } from '@/lib/poolTestStatus';
import { buildProviderConfig } from '@/lib/providerPoolHelpers';
import { runWithConcurrency } from '@/lib/concurrency';
import type {
  ExtensionSettings,
  PoolProvider,
  PoolKey,
  ProviderConfig,
  KeyTestResult,
} from '@/types/config';
import { testConnection } from '@/services/providerTester';

interface ProvidersSectionProps {
  /** Called when the user clicks "Open setup guide" in the readiness banner. */
  onOpenSetup?: () => void;
  /** FR-9: called when the user clicks "Edit system prompt →" in the
   *  readiness banner; App.tsx wires it to `setActiveTab('advanced')`. */
  onNavigateToAdvanced?: () => void;
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

/**
 * Max concurrent connection tests during "Test all keys" (FR-8). Caps
 * in-flight requests against provider rate limits while still finishing
 * ~4× faster than the old sequential runner for pools with many keys.
 */
const BULK_TEST_CONCURRENCY = 4;

export function ProvidersSection({ onOpenSetup, onNavigateToAdvanced }: ProvidersSectionProps = {}) {
  const settings = useSettingsStore();
  const providers = useSettingsStore((s) => s.providers);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const { success: showSuccess } = useToast();
  const [expandedProviderIds, setExpandedProviderIds] = useState<Set<string>>(new Set());
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isBulkTesting, setIsBulkTesting] = useState(false);
  // FR-8: live N/M progress counter shown in the "Test all keys" button while
  // the parallel bulk test is running. `{done, total}` or `null` when idle.
  const [bulkTestProgress, setBulkTestProgress] = useState<{ done: number; total: number } | null>(null);

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

  /**
   * Test all enabled (provider, key) pairs in parallel (FR-8) and aggregate
   * results. Up to BULK_TEST_CONCURRENCY tests run concurrently; each key's
   * `lastTestResult` is committed AS IT RESOLVES so the per-row badge updates
   * live (the existing store path is already reactive). A live N/M counter
   * drives the banner button label.
   */
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
    setBulkTestProgress({ done: 0, total: slots.length });
    let healthy = 0;
    let done = 0;

    await runWithConcurrency(
      slots,
      async (slot) => {
        let keyResult: KeyTestResult;
        try {
          const result = await testConnection(slot.config, undefined, settings.targetLanguage);
          keyResult = {
            success: result.overall,
            at: Date.now(),
            latencyMs: result.totalLatencyMs,
            error: result.overall ? undefined : result.steps.find((s) => !s.success)?.error,
          };
          if (result.overall) healthy++;
        } catch {
          keyResult = { success: false, at: Date.now(), error: 'Test failed' };
        }
        // Commit each key's result live so its row re-renders immediately.
        commitProviders(
          providers.map((p) =>
            p.id === slot.providerId
              ? {
                  ...p,
                  keys: p.keys.map((k) =>
                    k.id === slot.keyId ? { ...k, lastTestResult: keyResult } : k,
                  ),
                }
              : p,
          ),
        );
        done++;
        setBulkTestProgress({ done, total: slots.length });
      },
      { concurrency: BULK_TEST_CONCURRENCY },
    );

    setIsBulkTesting(false);
    setBulkTestProgress(null);
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
                {onNavigateToAdvanced && (
                  <button
                    type="button"
                    onClick={onNavigateToAdvanced}
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1"
                  >
                    Edit system prompt <ArrowRight className="w-3 h-3" />
                  </button>
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
                  {isBulkTesting && bulkTestProgress
                    ? `Testing ${bulkTestProgress.done}/${bulkTestProgress.total}…`
                    : 'Test all keys'}
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

        {providers.map((provider, idx) => (
          <div key={provider.id} className="animate-stagger" style={stagger(idx + 1)}>
            <ProviderCard
              provider={provider}
              isExpanded={expandedProviderIds.has(provider.id)}
              targetLanguage={settings.targetLanguage}
              onToggle={() => toggleProvider(provider.id)}
              onUpdateProvider={(patch) => updateProviderFields(provider.id, patch)}
              onUpdateKey={(keyId, patch) => updateKey(provider.id, keyId, patch)}
              onAddKey={() => addKey(provider.id)}
              onRemoveKey={(keyId) => removeKey(provider.id, keyId)}
              onRequestRemove={() => setPendingDeleteId(provider.id)}
              onCatalogSelect={(selection) => handleCatalogSelect(provider.id, selection)}
              onTestComplete={(result) => updateProviderFields(provider.id, { lastTestResult: result })}
            />
          </div>
        ))}

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
