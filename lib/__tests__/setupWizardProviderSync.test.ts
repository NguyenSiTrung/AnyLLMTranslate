/**
 * Regression: Setup Wizard Step 2 (provider) must apply catalog selection
 * via a single atomic settings write. Concurrent updateProvider + updateSettings
 * partial writes race on load→merge→save and can drop baseUrl/model.
 */

import { describe, expect, it } from 'vitest';
import { deepMerge } from '@/lib/utils';
import { syncProviderToPool } from '@/lib/config';
import { DEFAULT_SETTINGS, type ExtensionSettings, type ProviderConfig } from '@/types/config';
import { resolveCatalogSelection } from '@/entrypoints/options/components/ProviderCatalogPicker';
import { getCatalogEntryById } from '@/lib/openAiCompatibleCatalog';
import { getProviderReadiness } from '@/lib/providerReadiness';

function applyAtomicWizardPatch(
  current: ExtensionSettings,
  patch: Partial<ProviderConfig>,
): ExtensionSettings {
  return deepMerge(current as unknown as Record<string, unknown>, {
    provider: { ...current.provider, ...patch },
    providers: syncProviderToPool(current.providers ?? [], patch),
  } as Record<string, unknown>) as unknown as ExtensionSettings;
}

/** Simulates the OLD buggy dual concurrent partial writes (last write wins). */
function applyDualPartialWritesRace(
  current: ExtensionSettings,
  patch: Partial<ProviderConfig>,
  lastWrite: 'providers' | 'provider',
): ExtensionSettings {
  const providerOnly = deepMerge(current as unknown as Record<string, unknown>, {
    provider: { ...current.provider, ...patch },
  } as Record<string, unknown>) as unknown as ExtensionSettings;

  const providersOnly = deepMerge(current as unknown as Record<string, unknown>, {
    providers: syncProviderToPool(current.providers ?? [], patch),
  } as Record<string, unknown>) as unknown as ExtensionSettings;

  // Both started from the same snapshot; last save wins entirely.
  return lastWrite === 'providers' ? providersOnly : providerOnly;
}

describe('setup wizard provider selection sync', () => {
  const openRouter = getCatalogEntryById('openrouter');
  if (!openRouter) throw new Error('openrouter catalog entry missing');

  const selection = resolveCatalogSelection(openRouter, {
    apiKey: '',
    model: '',
  });

  it('dual concurrent partial writes can drop catalog baseUrl (the race)', () => {
    const current = { ...DEFAULT_SETTINGS, providers: [] as ExtensionSettings['providers'] };
    const lost = applyDualPartialWritesRace(current, selection.patch, 'providers');

    // providers[0] got the selection, but legacy mirror stayed empty — wizard UI
    // reads settings.provider.baseUrl / inferCatalogId, so selection appears to fail.
    expect(lost.providers[0]?.baseUrl).toBe(openRouter.baseUrl);
    expect(lost.provider.baseUrl).toBe('');
    expect(lost.provider.model).toBe('');
  });

  it('atomic provider+providers write keeps catalog selection on both mirrors', () => {
    const current = { ...DEFAULT_SETTINGS, providers: [] as ExtensionSettings['providers'] };
    const next = applyAtomicWizardPatch(current, selection.patch);

    expect(next.provider.baseUrl).toBe(openRouter.baseUrl);
    expect(next.provider.model).toBe(openRouter.defaultModel);
    expect(next.provider.displayName).toBe(openRouter.displayName);
    expect(next.provider.requiresApiKey).toBe(true);

    expect(next.providers).toHaveLength(1);
    expect(next.providers[0]?.baseUrl).toBe(openRouter.baseUrl);
    expect(next.providers[0]?.model).toBe(openRouter.defaultModel);
    expect(next.providers[0]?.displayName).toBe(openRouter.displayName);
  });

  it('after catalog pick, readiness requires only the API key (model+url filled)', () => {
    const current = { ...DEFAULT_SETTINGS, providers: [] as ExtensionSettings['providers'] };
    const next = applyAtomicWizardPatch(current, selection.patch);
    const readiness = getProviderReadiness(next.provider);

    expect(readiness.canTest).toBe(false);
    expect(readiness.reason).toBe('missing-api-key');

    const withKey = applyAtomicWizardPatch(next, {
      apiKey: 'sk-or-test',
      connectionStatus: 'unknown',
    });
    expect(getProviderReadiness(withKey.provider).canTest).toBe(true);
  });
});
