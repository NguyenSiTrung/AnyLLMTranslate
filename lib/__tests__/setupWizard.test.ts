import { describe, expect, it } from 'vitest';
import {
  WIZARD_STEPS,
  WIZARD_STEP_LABELS,
  normalizeWizardStep,
  resolveWizardEntryStep,
  wizardStepIndex,
} from '@/lib/setupWizard';
import { deepMerge } from '@/lib/utils';
import { syncProviderToPool } from '@/lib/config';
import { DEFAULT_SETTINGS, type ExtensionSettings, type ProviderConfig } from '@/types/config';
import type { KeyTestResult, PoolProvider } from '@/types/config';
import { resolveCatalogSelection } from '@/entrypoints/options/components/ProviderCatalogPicker';
import { getCatalogEntryById } from '@/lib/openAiCompatibleCatalog';
import { getProviderReadiness } from '@/lib/providerReadiness';

describe('setupWizard steps', () => {
  it('exposes four steps in order; wizardStepIndex is 1-based', () => {
    expect(WIZARD_STEPS).toEqual(['welcome', 'connect', 'verify', 'ready']);
    expect(WIZARD_STEP_LABELS.welcome).toBe('Welcome');
    expect(WIZARD_STEP_LABELS.connect).toBe('Connect');
    expect(WIZARD_STEP_LABELS.verify).toBe('Verify');
    expect(WIZARD_STEP_LABELS.ready).toBe('Ready');

    expect(wizardStepIndex('welcome')).toBe(1);
    expect(wizardStepIndex('ready')).toBe(4);
  });

  it('normalizeWizardStep maps legacy and new ids', () => {
    expect(normalizeWizardStep('welcome')).toBe('welcome');
    expect(normalizeWizardStep('connect')).toBe('connect');
    expect(normalizeWizardStep('verify')).toBe('verify');
    expect(normalizeWizardStep('ready')).toBe('ready');
    expect(normalizeWizardStep('provider')).toBe('connect');
    expect(normalizeWizardStep('test')).toBe('verify');
    expect(normalizeWizardStep('language')).toBe('verify');
    expect(normalizeWizardStep('done')).toBe('ready');
    expect(normalizeWizardStep('nope')).toBeNull();
    expect(normalizeWizardStep(undefined)).toBeNull();
  });

  it('resolveWizardEntryStep: first run, completed reopen, resume lastStep, legacy ids, and ready-without-complete', () => {
    expect(resolveWizardEntryStep({ completed: false, skipped: false })).toBe('welcome');

    expect(
      resolveWizardEntryStep({
        completed: true,
        skipped: false,
        lastStep: 'ready',
      }),
    ).toBe('connect');

    expect(
      resolveWizardEntryStep({
        completed: false,
        skipped: false,
        lastStep: 'connect',
      }),
    ).toBe('connect');
    expect(
      resolveWizardEntryStep({
        completed: false,
        skipped: false,
        lastStep: 'verify',
      }),
    ).toBe('verify');

    expect(
      resolveWizardEntryStep({
        completed: false,
        skipped: false,
        // Storage may still hold legacy ids
        lastStep: 'provider',
      } as unknown as Parameters<typeof resolveWizardEntryStep>[0]),
    ).toBe('connect');

    expect(
      resolveWizardEntryStep({
        completed: false,
        skipped: true,
        lastStep: 'ready',
      }),
    ).toBe('welcome');
    expect(
      resolveWizardEntryStep({
        completed: false,
        skipped: false,
        lastStep: 'ready',
      }),
    ).toBe('verify');
  });
});

/**
 * Regression: Setup Wizard Step 2 (provider) must apply catalog selection
 * via a single atomic settings write. Concurrent updateProvider + updateSettings
 * partial writes race on load→merge→save and can drop baseUrl/model.
 */


function applyAtomicWizardPatch(
  current: ExtensionSettings,
  patch: Partial<ProviderConfig>,
): ExtensionSettings {
  return deepMerge(current as unknown as Record<string, unknown>, {
    provider: { ...current.provider, ...patch },
    providers: syncProviderToPool(current.providers ?? [], patch),
  } as Record<string, unknown>) as unknown as ExtensionSettings;
}

describe('setup wizard provider selection sync', () => {
  const openRouter = getCatalogEntryById('openrouter');
  if (!openRouter) throw new Error('openrouter catalog entry missing');

  const selection = resolveCatalogSelection(openRouter, {
    apiKey: '',
    model: '',
  });

  it('atomic provider+providers write keeps catalog selection on both mirrors, and readiness then requires only the API key', () => {
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

describe('syncProviderToPool connection-test status', () => {
  const baseProvider: PoolProvider = {
    id: 'p1',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'model-a',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    keys: [
      {
        id: 'k1',
        apiKey: 'sk-old',
        maxRpm: 20,
        concurrencyLimit: 1,
        interval: 500,
        enabled: true,
      },
    ],
  };

  const okResult: KeyTestResult = { success: true, at: 123, latencyMs: 45 };

  it('persists a connection-test result onto keys[0]', () => {
    const next = syncProviderToPool(
      [baseProvider],
      { connectionStatus: 'success' },
      { lastTestResult: okResult },
    );
    expect(next[0]?.keys[0]?.lastTestResult).toEqual(okResult);
  });

  it('clears keys[0] lastTestResult when the apiKey changes', () => {
    const withResult = syncProviderToPool(
      [baseProvider],
      {},
      { lastTestResult: okResult },
    );
    expect(withResult[0]?.keys[0]?.lastTestResult).toBeDefined();

    const next = syncProviderToPool(withResult, { apiKey: 'sk-new' });
    expect(next[0]?.keys[0]?.lastTestResult).toBeUndefined();
  });

  it('clears provider lastTestResult when baseUrl or model changes', () => {
    const withProviderResult: PoolProvider = {
      ...baseProvider,
      lastTestResult: okResult,
    };
    const byUrl = syncProviderToPool([withProviderResult], { baseUrl: 'https://new/v1' });
    expect(byUrl[0]?.lastTestResult).toBeUndefined();

    const byModel = syncProviderToPool([withProviderResult], { model: 'model-b' });
    expect(byModel[0]?.lastTestResult).toBeUndefined();
  });
});
