/**
 * Providers Section — pool dashboard shell (ops redesign).
 *
 * Empty hero + guided add when unconfigured; command bar + rotation list +
 * edit drawer when providers exist. Public helpers `countEnabledKeys` /
 * `getPoolReadiness` stay stable for the popup.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Plus } from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import { inferCatalogId } from '../components/ProviderCatalogPicker';
import { EmptyPoolHero } from '../components/EmptyPoolHero';
import { GuidedAddProvider } from '../components/GuidedAddProvider';
import { PoolCommandBar } from '../components/PoolCommandBar';
import { ProviderEditDrawer } from '../components/ProviderEditDrawer';
import { ProviderRotationList } from '../components/ProviderRotationList';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { getPoolDashboardView } from '@/lib/poolDashboardStatus';
import { usePoolKeyStatuses } from '../hooks/usePoolKeyStatuses';
import { useProviderPoolActions } from '../hooks/useProviderPoolActions';
import type { ExtensionSettings, ProviderConfig } from '@/types/config';

interface ProvidersSectionProps {
  onOpenSetup?: () => void;
  onNavigateToAdvanced?: () => void;
}

export function ProvidersSection({
  onOpenSetup,
  onNavigateToAdvanced,
}: ProvidersSectionProps = {}) {
  const actions = useProviderPoolActions();
  const {
    providers,
    targetLanguage,
    updateProviderFields,
    updateKey,
    addKey,
    removeKey,
    removeProvider,
    addProviderFromCatalog,
    reorderProviders,
    moveProvider,
    reorderKeys,
    moveKey,
    handleTestAll,
    handleTestProvider,
    isBulkTesting,
    bulkTestProgress,
  } = actions;

  const settings = useSettingsStore();
  const { statuses, liveAvailable, refresh } = usePoolKeyStatuses(true);

  const [showGuidedAdd, setShowGuidedAdd] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [drawerSection, setDrawerSection] = useState<
    'connection' | 'keys' | 'advanced' | 'danger'
  >('connection');
  const [focusKeyId, setFocusKeyId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Refresh cooldown labels while any key is cooling
  useEffect(() => {
    if (!statuses) return;
    const hasCooling = Object.values(statuses).some((s) => s.open);
    if (!hasCooling) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [statuses]);

  const dashboardView = useMemo(
    () => getPoolDashboardView(settings, statuses, now),
    [settings, statuses, now],
  );

  const editingProvider =
    providers.find((p) => p.id === editingProviderId) ?? null;

  const openEdit = useCallback(
    (providerId: string, opts?: { keyId?: string; section?: typeof drawerSection }) => {
      setEditingProviderId(providerId);
      setFocusKeyId(opts?.keyId ?? null);
      setDrawerSection(opts?.keyId ? 'keys' : opts?.section ?? 'connection');
    },
    [],
  );

  const closeEdit = useCallback(() => {
    setEditingProviderId(null);
    setFocusKeyId(null);
  }, []);

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

  const onGuidedComplete = useCallback(
    (providerId: string) => {
      setShowGuidedAdd(false);
      openEdit(providerId, { section: 'keys' });
      void refresh();
    },
    [openEdit, refresh],
  );

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Providers"
        description="Your LLM pool — rotation, keys, and live health."
        icon={<Layers className="w-4 h-4" />}
        accentColor="cyan"
      />

      <div className="space-y-4">
        {providers.length === 0 ? (
          <div className="animate-stagger" style={stagger(0)}>
            <EmptyPoolHero
              onAddProvider={() => setShowGuidedAdd(true)}
              onOpenSetup={onOpenSetup}
            />
          </div>
        ) : (
          <>
            <div className="animate-stagger" style={stagger(0)}>
              <PoolCommandBar
                view={dashboardView}
                liveAvailable={liveAvailable}
                isBulkTesting={isBulkTesting}
                bulkTestProgress={bulkTestProgress}
                onTestAll={() => {
                  void handleTestAll().then(() => refresh());
                }}
                onAddProvider={() => setShowGuidedAdd(true)}
                onOpenSetup={onOpenSetup}
                onNavigateToAdvanced={onNavigateToAdvanced}
              />
            </div>

            <p className="text-xs text-zinc-500 animate-stagger" style={stagger(1)}>
              Top providers and keys are preferred in rotation. Unhealthy keys are
              skipped automatically.
            </p>

            <div className="animate-stagger" style={stagger(2)}>
              <ProviderRotationList
                providers={providers}
                liveByKeyId={statuses}
                now={now}
                onReorder={reorderProviders}
                onMove={moveProvider}
                onToggleEnabled={(id, enabled) =>
                  updateProviderFields(id, { enabled })
                }
                onTestProvider={(id) => {
                  void handleTestProvider(id).then(() => refresh());
                }}
                onEdit={(id, opts) => openEdit(id, opts)}
                onRemove={(id) => setPendingDeleteId(id)}
              />
            </div>

            <div className="animate-stagger" style={stagger(3)}>
              <Button
                variant="secondary"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setShowGuidedAdd(true)}
              >
                Add provider
              </Button>
            </div>
          </>
        )}
      </div>

      <ProviderEditDrawer
        provider={editingProvider}
        open={Boolean(editingProvider)}
        initialSection={drawerSection}
        focusKeyId={focusKeyId}
        targetLanguage={targetLanguage}
        liveByKeyId={statuses}
        onClose={closeEdit}
        onUpdateProvider={(patch) => {
          if (editingProviderId) updateProviderFields(editingProviderId, patch);
        }}
        onUpdateKey={(keyId, patch) => {
          if (editingProviderId) updateKey(editingProviderId, keyId, patch);
        }}
        onAddKey={() => {
          if (editingProviderId) addKey(editingProviderId);
        }}
        onRemoveKey={(keyId) => {
          if (editingProviderId) removeKey(editingProviderId, keyId);
        }}
        onReorderKey={(from, to) => {
          if (editingProviderId) reorderKeys(editingProviderId, from, to);
        }}
        onMoveKey={(keyId, dir) => {
          if (editingProviderId) moveKey(editingProviderId, keyId, dir);
        }}
        onTestProvider={() => {
          if (editingProviderId) {
            void handleTestProvider(editingProviderId).then(() => refresh());
          }
        }}
        onRequestRemoveProvider={() => {
          if (editingProviderId) setPendingDeleteId(editingProviderId);
        }}
        onCatalogSelect={(selection) => {
          if (editingProviderId) handleCatalogSelect(editingProviderId, selection);
        }}
        isTestingProvider={isBulkTesting}
      />

      {showGuidedAdd && (
        <GuidedAddProvider
          targetLanguage={targetLanguage}
          addProviderFromCatalog={addProviderFromCatalog}
          onComplete={onGuidedComplete}
          onClose={() => setShowGuidedAdd(false)}
        />
      )}

      {pendingDeleteId && (
        <Modal
          title="Remove provider?"
          message="This will remove the provider and all its API keys. This cannot be undone."
          confirmLabel="Remove"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={() => {
            removeProvider(pendingDeleteId);
            if (editingProviderId === pendingDeleteId) {
              setEditingProviderId(null);
            }
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
