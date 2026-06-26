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
  it('returns an empty array for an empty providers list', () => {
    expect(resolveSlots([])).toEqual([]);
  });

  it('flattens enabled-provider × enabled-key pairs into ordered PoolSlots', () => {
    const providers = [
      provider({
        id: 'p1',
        keys: [
          { id: 'k1', apiKey: 'a', maxRpm: 0, enabled: true },
          { id: 'k2', apiKey: 'b', maxRpm: 0, enabled: true },
        ],
      }),
      provider({
        id: 'p2',
        keys: [{ id: 'k3', apiKey: 'c', maxRpm: 0, enabled: true }],
      }),
    ];

    const slots = resolveSlots(providers);

    expect(slots.map((s) => s.keyId)).toEqual(['k1', 'k2', 'k3']);
    expect(slots.map((s) => s.providerId)).toEqual(['p1', 'p1', 'p2']);
  });

  it('excludes keys from disabled providers', () => {
    const providers = [
      provider({
        id: 'p1',
        enabled: false,
        keys: [{ id: 'k1', apiKey: 'a', maxRpm: 0, enabled: true }],
      }),
      provider({
        id: 'p2',
        enabled: true,
        keys: [{ id: 'k2', apiKey: 'b', maxRpm: 0, enabled: true }],
      }),
    ];

    const slots = resolveSlots(providers);
    expect(slots.map((s) => s.keyId)).toEqual(['k2']);
  });

  it('excludes disabled keys within an enabled provider', () => {
    const providers = [
      provider({
        id: 'p1',
        keys: [
          { id: 'k1', apiKey: 'a', maxRpm: 0, enabled: true },
          { id: 'k2', apiKey: 'b', maxRpm: 0, enabled: false },
          { id: 'k3', apiKey: 'c', maxRpm: 0, enabled: true },
        ],
      }),
    ];

    const slots = resolveSlots(providers);
    expect(slots.map((s) => s.keyId)).toEqual(['k1', 'k3']);
  });

  it('produces stable insertion order (provider, then key)', () => {
    const providers = [
      provider({
        id: 'pB',
        keys: [
          { id: 'kB2', apiKey: '', maxRpm: 0, enabled: true },
          { id: 'kB1', apiKey: '', maxRpm: 0, enabled: true },
        ],
      }),
      provider({
        id: 'pA',
        keys: [{ id: 'kA1', apiKey: '', maxRpm: 0, enabled: true }],
      }),
    ];

    // Order is insertion order, NOT sorted by id.
    expect(resolveSlots(providers).map((s) => s.keyId)).toEqual(['kB2', 'kB1', 'kA1']);
  });

  it('carries the full provider config + key onto each slot', () => {
    const p = provider({
      id: 'p1',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 8192,
      keys: [{ id: 'k1', apiKey: 'sk-x', maxRpm: 60, enabled: true, label: 'prod' }],
    });

    const slot = resolveSlots([p])[0]!;
    expect(slot.providerId).toBe('p1');
    expect(slot.keyId).toBe('k1');
    expect(slot.providerConfig.baseUrl).toBe('https://api.openai.com/v1');
    expect(slot.providerConfig.model).toBe('gpt-4o');
    expect(slot.providerConfig.apiKey).toBe('sk-x');
    expect(slot.providerConfig.maxRpm).toBe(60);
    expect(slot.providerConfig.temperature).toBe(0.7);
  });
});

describe('healthySlots', () => {
  function slots(ids: string[]): PoolSlot[] {
    return ids.map((id, i) => ({
      providerId: `p${i}`,
      keyId: id,
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
    }));
  }

  it('returns all slots when the breaker has no open slots', () => {
    const s = slots(['k1', 'k2', 'k3']);
    const breaker = createCircuitBreaker({ clock: () => NOW });
    expect(healthySlots(s, breaker, NOW).map((x) => x.keyId)).toEqual(['k1', 'k2', 'k3']);
  });

  it('excludes slots whose breaker is open', () => {
    const s = slots(['k1', 'k2', 'k3']);
    const breaker = createCircuitBreaker({ clock: () => NOW });
    breaker.recordFailure('k2', 'rateLimit', NOW);
    expect(healthySlots(s, breaker, NOW).map((x) => x.keyId)).toEqual(['k1', 'k3']);
  });

  it('re-includes a slot once its cooldown expires', () => {
    const s = slots(['k1', 'k2']);
    const breaker = createCircuitBreaker({ clock: () => NOW });
    breaker.recordFailure('k1', 'rateLimit', NOW); // open 60s
    expect(healthySlots(s, breaker, NOW + 59_999).map((x) => x.keyId)).toEqual(['k2']);
    expect(healthySlots(s, breaker, NOW + 60_000).map((x) => x.keyId)).toEqual(['k1', 'k2']);
  });

  it('returns an empty array when all slots are open', () => {
    const s = slots(['k1', 'k2']);
    const breaker = createCircuitBreaker({ clock: () => NOW });
    breaker.recordFailure('k1', 'auth', NOW);
    breaker.recordFailure('k2', 'rateLimit', NOW);
    expect(healthySlots(s, breaker, NOW)).toEqual([]);
  });
});
