import { describe, expect, it } from 'vitest';
import { resolvePoolBatchBudgets } from '../poolBatchBudgets';
import { DEFAULT_SETTINGS, type ExtensionSettings, type PoolProvider } from '@/types/config';
import { resolveSlots, healthySlots, type PoolSlot } from '@/lib/poolResolver';
import { createCircuitBreaker } from '@/lib/circuitBreaker';
import { buildProviderConfig, canRunConnectionTest, derivePopupConnectionStatus, getCredentialKey, getProviderTestStatus, toPopupConnectionStatus } from '../providerPoolHelpers';
import { createPoolCursor } from '../poolCursor';
import { reorderByIndex, moveProviderById } from '../poolReorder';
import { collectTestableSlots, collectTestableSlotsForProvider } from '../poolBulkTest';
import { providerCredentialsChanged, formatTestResultAge } from '../poolTestStatus';
import { getPoolDashboardView, formatCooldownRemaining } from '../poolDashboardStatus';

function settingsWithProviders(providers: PoolProvider[]): ExtensionSettings {
  return { ...DEFAULT_SETTINGS, providers };
}

describe('resolvePoolBatchBudgets', () => {
  it('uses global defaults, ignores disabled/zero overrides, and picks tightest enabled override (min)', () => {
    const s = settingsWithProviders([
      {
        id: 'p1',
        displayName: 'P1',
        baseUrl: 'https://a/v1',
        model: 'm',
        requiresApiKey: true,
        temperature: 0.3,
        maxTokens: 4096,
        enabled: true,
        keys: [{ id: 'k1', apiKey: 'sk', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true }],
      },
    ]);
    expect(resolvePoolBatchBudgets(s)).toEqual({
      maxTextGroupLengthPerRequest: s.maxTextGroupLengthPerRequest,
      maxTextLengthPerRequest: s.maxTextLengthPerRequest,
    });

    // Disabled providers and zero/undefined overrides are ignored
    const mixed = settingsWithProviders([
      {
        id: 'off',
        displayName: 'Off',
        baseUrl: 'https://a/v1',
        model: 'm',
        requiresApiKey: true,
        temperature: 0.3,
        maxTokens: 4096,
        enabled: false,
        maxBatchChars: 100,
        maxTextGroupCount: 1,
        keys: [{ id: 'k0', apiKey: 'sk', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true }],
      },
      {
        id: 'on',
        displayName: 'On',
        baseUrl: 'https://b/v1',
        model: 'm',
        requiresApiKey: true,
        temperature: 0.3,
        maxTokens: 4096,
        enabled: true,
        maxBatchChars: 0,
        maxTextGroupCount: undefined,
        keys: [{ id: 'k1', apiKey: 'sk', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true }],
      },
    ]);
    expect(resolvePoolBatchBudgets(mixed)).toEqual({
      maxTextGroupLengthPerRequest: mixed.maxTextGroupLengthPerRequest,
      maxTextLengthPerRequest: mixed.maxTextLengthPerRequest,
    });

    // uses the tightest enabled-provider override (min of positive values)
    const s2 = settingsWithProviders([
      {
        id: 'p1',
        displayName: 'P1',
        baseUrl: 'https://a/v1',
        model: 'm',
        requiresApiKey: true,
        temperature: 0.3,
        maxTokens: 4096,
        enabled: true,
        maxBatchChars: 800,
        maxTextGroupCount: 2,
        keys: [{ id: 'k1', apiKey: 'sk', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true }],
      },
      {
        id: 'p2',
        displayName: 'P2',
        baseUrl: 'https://b/v1',
        model: 'm',
        requiresApiKey: true,
        temperature: 0.3,
        maxTokens: 4096,
        enabled: true,
        maxBatchChars: 1200,
        maxTextGroupCount: 6,
        keys: [{ id: 'k2', apiKey: 'sk', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true }],
      },
    ]);
    // Global is 4 / 2000; overrides tighten to min(800,1200)=800 and min(2,6)=2
    expect(resolvePoolBatchBudgets(s2)).toEqual({
      maxTextGroupLengthPerRequest: 2,
      maxTextLengthPerRequest: 800,
    });
  });
});

function googleMulti(): PoolProvider {
  return {
    id: 'g1',
    displayName: 'G',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    catalogId: 'google-ai-studio',
    model: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    modelStrategy: 'preferred_failover',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    keys: [
      {
        id: 'k1',
        apiKey: 'sk-1',
        maxRpm: 20,
        concurrencyLimit: 1,
        interval: 500,
        enabled: true,
      },
      {
        id: 'k2',
        apiKey: 'sk-2',
        maxRpm: 20,
        concurrencyLimit: 1,
        interval: 500,
        enabled: true,
      },
    ],
  };
}

const NOW = 5_000_000;

function provider(overrides: Partial<PoolProvider> = {}): PoolProvider {
  return {
    id: 'p1',
    displayName: 'P1',
    baseUrl: 'https://api.example.com/v1',
    model: 'gpt-test',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    keys: [],
    ...overrides,
  };
}

describe('resolveSlots', () => {
  it('flattens enabled provider×key pairs, expands multi-model slots, and skips empty keys when required', () => {
    // facet: flattens enabled provider×key pairs in insertion order and carries config
    expect(resolveSlots([])).toEqual([]);

    const providers = [
      provider({
        id: 'p1',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 8192,
        thinkingMode: 'off',
        keys: [
          {
            id: 'k1',
            apiKey: 'sk-x',
            maxRpm: 60,
            concurrencyLimit: 0,
            interval: 0,
            enabled: true,
            label: 'prod',
          },
          { id: 'k2', apiKey: 'b', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: false },
          { id: 'k3', apiKey: 'c', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
        ],
      }),
      provider({
        id: 'p2',
        enabled: false,
        keys: [{ id: 'k-disabled-provider', apiKey: 'a', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true }],
      }),
      provider({
        id: 'p3',
        keys: [{ id: 'k4', apiKey: 'd', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true }],
      }),
    ];

    const slots = resolveSlots(providers);
    expect(slots.map((s) => s.keyId)).toEqual(['k1', 'k3', 'k4']);
    expect(slots.map((s) => s.providerId)).toEqual(['p1', 'p1', 'p3']);
    expect(slots[0]).toMatchObject({
      providerId: 'p1',
      keyId: 'k1',
      providerConfig: {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        apiKey: 'sk-x',
        maxRpm: 60,
        temperature: 0.7,
        thinkingMode: 'off',
      },
    });

    // Insertion order, not id-sorted.
    const ordered = [
      provider({
        id: 'pB',
        requiresApiKey: false,
        keys: [
          { id: 'kB2', apiKey: '', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
          { id: 'kB1', apiKey: '', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
        ],
      }),
      provider({
        id: 'pA',
        requiresApiKey: false,
        keys: [{ id: 'kA1', apiKey: '', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true }],
      }),
    ];
    expect(resolveSlots(ordered).map((s) => s.keyId)).toEqual(['kB2', 'kB1', 'kA1']);

    // Per-provider maxBatchChars / maxTextGroupCount carry into slots
    const budgetSlots = resolveSlots([
      provider({
        maxBatchChars: 1500,
        maxTextGroupCount: 2,
        keys: [{ id: 'k1', apiKey: 'sk', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true }],
      }),
    ]);
    expect(budgetSlots[0]?.providerConfig.maxBatchChars).toBe(1500);
    expect(budgetSlots[0]?.providerConfig.maxTextGroupCount).toBe(2);

    // facet: expands supported models, preserves default single slots, and filters healthy slot breakers
    const multiSlots = resolveSlots([googleMulti()]);
    expect(multiSlots.map((s) => s.slotId)).toEqual([
      'k1::gemini-2.5-flash',
      'k2::gemini-2.5-flash',
      'k1::gemini-2.5-flash-lite',
      'k2::gemini-2.5-flash-lite',
    ]);
    expect(multiSlots.map((s) => s.providerConfig.model)).toEqual([
      'gemini-2.5-flash',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash-lite',
    ]);
    expect(multiSlots[0]!.keyId).toBe('k1');
    expect(multiSlots[0]!.model).toBe('gemini-2.5-flash');
    expect(multiSlots[0]!.multiModel).toBe(true);

    const p = googleMulti();
    delete p.models;
    const single = resolveSlots([p]);
    expect(single).toHaveLength(2);
    expect(single.map((s) => s.slotId)).toEqual(['k1', 'k2']);
    expect(single.every((s) => !s.multiModel)).toBe(true);

    const orSlots = resolveSlots([
      {
        id: 'or',
        displayName: 'OR',
        baseUrl: 'https://openrouter.ai/api/v1',
        catalogId: 'openrouter',
        model: 'openai/gpt-4o-mini',
        models: ['a', 'b'],
        requiresApiKey: true,
        temperature: 0.3,
        maxTokens: 4096,
        enabled: true,
        keys: [
          {
            id: 'k1',
            apiKey: 'sk',
            maxRpm: 0,
            concurrencyLimit: 0,
            interval: 0,
            enabled: true,
          },
        ],
      },
    ]);
    expect(orSlots).toHaveLength(1);
    expect(orSlots[0]!.slotId).toBe('k1');
    expect(orSlots[0]!.providerConfig.model).toBe('openai/gpt-4o-mini');
    {
    // Regression: multi-model resolveProviderModels used to return [] for
    // model:'' → resolveSlots skipped the provider → empty pool.
    const defaultSlots = resolveSlots([
      {
        id: 'p_default',
        displayName: 'Custom',
        baseUrl: '',
        model: '',
        requiresApiKey: false,
        temperature: 0.3,
        maxTokens: 4096,
        enabled: true,
        keys: [
          {
            id: 'k_default',
            apiKey: '',
            maxRpm: 20,
            concurrencyLimit: 1,
            interval: 500,
            enabled: true,
          },
        ],
      },
    ]);
    expect(defaultSlots).toHaveLength(1);
    expect(defaultSlots[0]?.slotId).toBe('k_default');
    expect(defaultSlots[0]?.providerConfig.model).toBe('');
    }

    const healthyTestSlots = resolveSlots([googleMulti()]);
    const breaker = createCircuitBreaker({ clock: () => 0 });
    breaker.recordFailure(healthyTestSlots[0]!.slotId, 'rateLimit', 0);
    const healthy = healthySlots(healthyTestSlots, breaker, 0);
    expect(healthy.map((s) => s.slotId)).not.toContain('k1::gemini-2.5-flash');
    expect(healthy.map((s) => s.slotId)).toContain('k1::gemini-2.5-flash-lite');

    // facet: skips empty apiKey when requiresApiKey is true, keeps empty for keyless
    const withEmpty = [
      provider({
        id: 'needs-key',
        requiresApiKey: true,
        keys: [
          { id: 'empty', apiKey: '   ', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
          { id: 'good', apiKey: 'sk-real', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
        ],
      }),
      provider({
        id: 'local',
        requiresApiKey: false,
        keys: [
          { id: 'no-key', apiKey: '', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
        ],
      }),
    ];
    expect(resolveSlots(withEmpty).map((s) => s.keyId)).toEqual(['good', 'no-key']);
  });
});

describe('healthySlots', () => {
  function slots(ids: string[]): PoolSlot[] {
    return ids.map((id, i) => ({
      providerId: `p${i}`,
      keyId: id,
      model: 'm',
      slotId: id,
      multiModel: false,
      modelStrategy: 'preferred_failover' as const,
      providerConfig: {
        preset: 'custom' as const,
        baseUrl: 'https://x/v1',
        apiKey: '',
        model: 'm',
        temperature: 0.3,
        maxTokens: 4096,
        displayName: 'X',
        requiresApiKey: false,
        maxRpm: 0,
      },
      concurrencyLimit: 0,
      interval: 0,
    }));
  }

  it('filters by breaker open state, cooldown expiry, and all-open', () => {
    const s = slots(['k1', 'k2', 'k3']);
    const breaker = createCircuitBreaker({ clock: () => NOW });
    expect(healthySlots(s, breaker, NOW).map((x) => x.keyId)).toEqual(['k1', 'k2', 'k3']);

    breaker.recordFailure('k2', 'rateLimit', NOW);
    expect(healthySlots(s, breaker, NOW).map((x) => x.keyId)).toEqual(['k1', 'k3']);

    const two = slots(['k1', 'k2']);
    const breaker2 = createCircuitBreaker({ clock: () => NOW });
    breaker2.recordFailure('k1', 'rateLimit', NOW);
    expect(healthySlots(two, breaker2, NOW + 59_999).map((x) => x.keyId)).toEqual(['k2']);
    expect(healthySlots(two, breaker2, NOW + 60_000).map((x) => x.keyId)).toEqual(['k1', 'k2']);

    breaker2.recordFailure('k2', 'auth', NOW);
    expect(healthySlots(two, breaker2, NOW)).toEqual([]);
  });
});

/**
 * Pure provider-pool UI and cursor/reorder/bulk helpers (FR-1).
 */


function makeProvider(overrides: Partial<PoolProvider> = {}): PoolProvider {
  return {
    id: 'p1',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    keys: [{ id: 'k1', apiKey: 'sk-test', maxRpm: 60, concurrencyLimit: 0, interval: 0, enabled: true }],
    ...overrides,
  };
}

describe('provider pool UI and operational helpers', () => {
  it('picks credentials, gates tests, builds config, handles cursor/reorder/bulk/status/dashboard helpers, and maps pool lastTestResult to popup footer status', () => {
    const withThinking = makeProvider({ thinkingMode: 'off', thinkingEffort: 'high' });
    const built = buildProviderConfig(withThinking, withThinking.keys[0]!);
    expect(built.thinkingMode).toBe('off');
    expect(built.thinkingEffort).toBe('high');

    const keyed = makeProvider({
      keys: [
        { id: 'k1', apiKey: '', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
        { id: 'k2', apiKey: 'sk-2', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
      ],
    });
    expect(getCredentialKey(keyed)?.id).toBe('k2');
    expect(getCredentialKey(makeProvider({ requiresApiKey: false }))?.id).toBe('k1');
    expect(
      getCredentialKey(
        makeProvider({
          keys: [{ id: 'k1', apiKey: '', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true }],
        }),
      ),
    ).toBeUndefined();

    expect(canRunConnectionTest(makeProvider({ baseUrl: '' }))).toBe(false);
    expect(canRunConnectionTest(makeProvider({ model: '' }))).toBe(false);
    expect(canRunConnectionTest(makeProvider({ requiresApiKey: false }))).toBe(true);
    const p = makeProvider();
    expect(canRunConnectionTest(p, p.keys[0])).toBe(true);

    const cfg = buildProviderConfig(p, p.keys[0]!);
    expect(cfg.maxRpm).toBe(60);
    expect(cfg.baseUrl).toBe(p.baseUrl);
    expect(cfg.apiKey).toBe('sk-test');

    // Cursor
    const cursor = createPoolCursor(3);
    expect([cursor.next(), cursor.next(), cursor.next(), cursor.next()]).toEqual([0, 1, 2, 0]);
    cursor.reset();
    expect(cursor.next()).toBe(0);

    // Reorder
    expect(reorderByIndex(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    const providers = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] as PoolProvider[];
    expect(moveProviderById(providers, 'p2', 'up').map((pr) => pr.id)).toEqual(['p2', 'p1', 'p3']);

    // Bulk slots
    expect(collectTestableSlots([makeProvider({ id: 'p1' })])).toEqual([{ providerId: 'p1', keyId: 'k1' }]);
    expect(collectTestableSlotsForProvider([makeProvider({ id: 'p1' })], 'p1')).toEqual([{ providerId: 'p1', keyId: 'k1' }]);

    // Test status & age formatting
    const oldP = makeProvider();
    expect(providerCredentialsChanged(oldP, oldP)).toBe(false);
    expect(providerCredentialsChanged(oldP, makeProvider({ baseUrl: 'https://other/v1' }))).toBe(true);

    const at = 1700000000000;
    expect(formatTestResultAge({ success: true, at }, at + 30_000)).toBe('just now');
    expect(formatTestResultAge({ success: true, at }, at + 5 * 60_000)).toBe('5m ago');

    // Dashboard & Cooldown
    expect(formatCooldownRemaining(65_000, 0)).toMatch(/1:05|65s/);
    expect(getPoolDashboardView({ ...DEFAULT_SETTINGS, providers: [] }, null, 0)).toMatchObject({
      state: 'not-ready',
      canTranslate: false,
    });

    // Pool key lastTestResult drives the popup footer connection status.
    const successfulKey = makeProvider({
      keys: [
        {
          id: 'k1',
          apiKey: 'sk-test',
          maxRpm: 60,
          concurrencyLimit: 0,
          interval: 0,
          enabled: true,
          lastTestResult: { success: true, at: 1, latencyMs: 120 },
        },
      ],
    });
    expect(getProviderTestStatus(successfulKey).state).toBe('healthy');
    // Legacy mirror still red/error must not win over a successful pool key test.
    expect(derivePopupConnectionStatus(successfulKey, 'error')).toBe('success');
    expect(toPopupConnectionStatus('healthy', 'error')).toBe('success');

    const failedKey = makeProvider({
      keys: [
        {
          id: 'k1',
          apiKey: 'sk-bad',
          maxRpm: 60,
          concurrencyLimit: 0,
          interval: 0,
          enabled: true,
          lastTestResult: { success: false, at: 1, error: '401' },
        },
      ],
    });
    expect(derivePopupConnectionStatus(failedKey, 'success')).toBe('error');

    const untested = makeProvider();
    expect(getProviderTestStatus(untested).state).toBe('untested');
    expect(derivePopupConnectionStatus(untested, 'error')).toBe('error');
    expect(derivePopupConnectionStatus(undefined, 'success')).toBe('success');
  });
});
