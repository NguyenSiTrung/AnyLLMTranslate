import { describe, it, expect } from 'vitest';
import { resolveSlots, healthySlots } from '@/lib/poolResolver';
import { createCircuitBreaker } from '@/lib/circuitBreaker';
import type { PoolProvider } from '@/types/config';

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

describe('resolveSlots multi-model', () => {
  it('expands model-major × key-major with composite slotId', () => {
    const slots = resolveSlots([googleMulti()]);
    expect(slots.map((s) => s.slotId)).toEqual([
      'k1::gemini-2.5-flash',
      'k2::gemini-2.5-flash',
      'k1::gemini-2.5-flash-lite',
      'k2::gemini-2.5-flash-lite',
    ]);
    expect(slots.map((s) => s.providerConfig.model)).toEqual([
      'gemini-2.5-flash',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash-lite',
    ]);
    expect(slots[0]!.keyId).toBe('k1');
    expect(slots[0]!.model).toBe('gemini-2.5-flash');
    expect(slots[0]!.multiModel).toBe(true);
  });

  it('keeps slotId === keyId for single-model', () => {
    const p = googleMulti();
    delete p.models;
    const slots = resolveSlots([p]);
    expect(slots).toHaveLength(2);
    expect(slots.map((s) => s.slotId)).toEqual(['k1', 'k2']);
    expect(slots.every((s) => !s.multiModel)).toBe(true);
  });

  it('does not expand models on OpenRouter', () => {
    const slots = resolveSlots([
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
    expect(slots).toHaveLength(1);
    expect(slots[0]!.slotId).toBe('k1');
    expect(slots[0]!.providerConfig.model).toBe('openai/gpt-4o-mini');
  });

  it('healthySlots filters by slotId breaker', () => {
    const slots = resolveSlots([googleMulti()]);
    const breaker = createCircuitBreaker({ clock: () => 0 });
    breaker.recordFailure(slots[0]!.slotId, 'rateLimit', 0);
    const healthy = healthySlots(slots, breaker, 0);
    expect(healthy.map((s) => s.slotId)).not.toContain('k1::gemini-2.5-flash');
    expect(healthy.map((s) => s.slotId)).toContain('k1::gemini-2.5-flash-lite');
  });
});
