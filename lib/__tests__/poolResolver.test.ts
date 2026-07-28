import { describe, it, expect } from 'vitest';
import { resolveSlots, healthySlots, type PoolSlot } from '../poolResolver';
import { createCircuitBreaker } from '../circuitBreaker';
import type { PoolProvider } from '@/types/config';

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
  it('flattens enabled provider×key pairs in insertion order and carries config', () => {
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
  });

  it('skips empty apiKey when requiresApiKey is true, keeps empty for keyless', () => {
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
