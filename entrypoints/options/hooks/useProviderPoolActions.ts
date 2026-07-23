/**
 * CRUD, reorder, and bulk connection-test actions for the provider pool.
 */

import { useCallback, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { poolIdGenerators } from '@/lib/config';
import { getCatalogEntryById } from '@/lib/openAiCompatibleCatalog';
import { applyProviderPatch, applyKeyPatch } from '@/lib/poolTestStatus';
import {
  collectTestableSlots,
  collectTestableSlotsForProvider,
} from '@/lib/poolBulkTest';
import {
  moveKeyById,
  moveProviderById,
  reorderByIndex,
} from '@/lib/poolReorder';
import { buildProviderConfig } from '@/lib/providerPoolHelpers';
import { runWithConcurrency } from '@/lib/concurrency';
import { testConnection } from '@/services/providerTester';
import { useToast } from '@/ui/ToastProvider';
import {
  DEFAULT_THINKING_EFFORT,
  defaultPoolKeyThrottle,
  type KeyTestResult,
  type PoolKey,
  type PoolProvider,
} from '@/types/config';

const BULK_TEST_CONCURRENCY = 4;

export function useProviderPoolActions() {
  const providers = useSettingsStore((s) => s.providers);
  const targetLanguage = useSettingsStore((s) => s.targetLanguage);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const { success: showSuccess } = useToast();
  const [isBulkTesting, setIsBulkTesting] = useState(false);
  const [bulkTestProgress, setBulkTestProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const commitProviders = useCallback(
    (next: PoolProvider[]) => {
      updateSettings({ providers: next });
    },
    [updateSettings],
  );

  const latestProviders = useCallback(
    () => useSettingsStore.getState().providers ?? [],
    [],
  );

  const updateProviderFields = useCallback(
    (providerId: string, patch: Partial<PoolProvider>) => {
      commitProviders(
        latestProviders().map((p) =>
          p.id === providerId ? applyProviderPatch(p, patch) : p,
        ),
      );
    },
    [commitProviders, latestProviders],
  );

  const updateKey = useCallback(
    (providerId: string, keyId: string, patch: Partial<PoolKey>) => {
      commitProviders(
        latestProviders().map((p) =>
          p.id === providerId
            ? {
                ...p,
                keys: p.keys.map((k) =>
                  k.id === keyId ? applyKeyPatch(k, patch) : k,
                ),
              }
            : p,
        ),
      );
    },
    [commitProviders, latestProviders],
  );

  const addKey = useCallback(
    (providerId: string) => {
      const newKeyId = poolIdGenerators.keyId();
      const newKey: PoolKey = {
        id: newKeyId,
        apiKey: '',
        ...defaultPoolKeyThrottle(),
        enabled: true,
      };
      commitProviders(
        latestProviders().map((p) =>
          p.id === providerId ? { ...p, keys: [...p.keys, newKey] } : p,
        ),
      );
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-key-id="${newKeyId}"]`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
      return newKeyId;
    },
    [commitProviders, latestProviders],
  );

  const removeKey = useCallback(
    (providerId: string, keyId: string) => {
      commitProviders(
        latestProviders().map((p) =>
          p.id === providerId
            ? { ...p, keys: p.keys.filter((k) => k.id !== keyId) }
            : p,
        ),
      );
    },
    [commitProviders, latestProviders],
  );

  const removeProvider = useCallback(
    (providerId: string) => {
      commitProviders(latestProviders().filter((p) => p.id !== providerId));
    },
    [commitProviders, latestProviders],
  );

  const addProviderFromCatalog = useCallback(
    (
      catalogId: string,
      overrides?: Partial<PoolProvider> & { apiKey?: string },
    ): string => {
      const entry = getCatalogEntryById(catalogId);
      const apiKey = overrides?.apiKey ?? '';
      const newProvider: PoolProvider = {
        id: poolIdGenerators.providerId(),
        displayName: overrides?.displayName ?? entry?.displayName ?? 'Custom',
        baseUrl: overrides?.baseUrl ?? entry?.baseUrl ?? '',
        model: overrides?.model ?? entry?.defaultModel ?? '',
        requiresApiKey: overrides?.requiresApiKey ?? entry?.requiresApiKey ?? true,
        catalogId,
        temperature: overrides?.temperature ?? 0.3,
        maxTokens: overrides?.maxTokens ?? 4096,
        requestTimeoutMs: overrides?.requestTimeoutMs ?? 60000,
        thinkingMode: overrides?.thinkingMode ?? 'auto',
        thinkingEffort: overrides?.thinkingEffort ?? DEFAULT_THINKING_EFFORT,
        enabled: overrides?.enabled ?? true,
        keys: [
          {
            id: poolIdGenerators.keyId(),
            apiKey,
            ...defaultPoolKeyThrottle(),
            enabled: true,
          },
        ],
      };
      commitProviders([...latestProviders(), newProvider]);
      showSuccess(`Added ${newProvider.displayName}`);
      return newProvider.id;
    },
    [commitProviders, latestProviders, showSuccess],
  );

  const reorderProviders = useCallback(
    (from: number, to: number) => {
      commitProviders(reorderByIndex(latestProviders(), from, to));
    },
    [commitProviders, latestProviders],
  );

  const moveProvider = useCallback(
    (providerId: string, direction: 'up' | 'down') => {
      commitProviders(moveProviderById(latestProviders(), providerId, direction));
    },
    [commitProviders, latestProviders],
  );

  const reorderKeys = useCallback(
    (providerId: string, from: number, to: number) => {
      commitProviders(
        latestProviders().map((p) =>
          p.id === providerId
            ? { ...p, keys: reorderByIndex(p.keys ?? [], from, to) }
            : p,
        ),
      );
    },
    [commitProviders, latestProviders],
  );

  const moveKey = useCallback(
    (providerId: string, keyId: string, direction: 'up' | 'down') => {
      commitProviders(
        latestProviders().map((p) =>
          p.id === providerId ? moveKeyById(p, keyId, direction) : p,
        ),
      );
    },
    [commitProviders, latestProviders],
  );

  const applyKeyTestResult = useCallback(
    (providerId: string, keyId: string, keyResult: KeyTestResult) => {
      const current = latestProviders();
      commitProviders(
        current.map((p) =>
          p.id === providerId
            ? {
                ...p,
                keys: p.keys.map((k) =>
                  k.id === keyId ? { ...k, lastTestResult: keyResult } : k,
                ),
              }
            : p,
        ),
      );
    },
    [commitProviders, latestProviders],
  );

  const runSlots = useCallback(
    async (
      slots: Array<{ providerId: string; keyId: string }>,
      labelPrefix: string,
    ) => {
      if (slots.length === 0) return;
      setIsBulkTesting(true);
      setBulkTestProgress({ done: 0, total: slots.length });
      let healthy = 0;
      let done = 0;

      await runWithConcurrency(
        slots,
        async (slot) => {
          const current = latestProviders();
          const provider = current.find((p) => p.id === slot.providerId);
          const poolKey = provider?.keys.find((k) => k.id === slot.keyId);
          let keyResult: KeyTestResult;
          if (!provider || !poolKey) {
            keyResult = { success: false, at: Date.now(), error: 'Missing provider/key' };
          } else {
            try {
              const result = await testConnection(
                buildProviderConfig(provider, poolKey),
                undefined,
                targetLanguage,
              );
              keyResult = {
                success: result.overall,
                at: Date.now(),
                latencyMs: result.totalLatencyMs,
                error: result.overall
                  ? undefined
                  : result.steps.find((s) => !s.success)?.error,
              };
              if (result.overall) healthy++;
            } catch {
              keyResult = { success: false, at: Date.now(), error: 'Test failed' };
            }
          }
          applyKeyTestResult(slot.providerId, slot.keyId, keyResult);
          done++;
          setBulkTestProgress({ done, total: slots.length });
        },
        { concurrency: BULK_TEST_CONCURRENCY },
      );

      setIsBulkTesting(false);
      setBulkTestProgress(null);
      showSuccess(
        `${labelPrefix}: ${healthy}/${slots.length} key${slots.length !== 1 ? 's' : ''} healthy`,
      );
    },
    [applyKeyTestResult, latestProviders, showSuccess, targetLanguage],
  );

  const handleTestAll = useCallback(async () => {
    await runSlots(collectTestableSlots(latestProviders()), 'Test complete');
  }, [latestProviders, runSlots]);

  const handleTestProvider = useCallback(
    async (providerId: string) => {
      await runSlots(
        collectTestableSlotsForProvider(latestProviders(), providerId),
        'Provider test complete',
      );
    },
    [latestProviders, runSlots],
  );

  return {
    providers: providers ?? [],
    targetLanguage,
    commitProviders,
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
  };
}
