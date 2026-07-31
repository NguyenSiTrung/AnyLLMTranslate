import { describe, it, expect } from 'vitest';
import {
  isGoogleAiStudioProvider,
  resolveProviderModels,
  isMultiModelActive,
  resolveModelStrategy,
  normalizeGoogleModels,
  makeSlotId,
} from '@/lib/googleMultiModel';
import type { PoolProvider } from '@/types/config';

function google(overrides: Partial<PoolProvider> = {}): PoolProvider {
  return {
    id: 'g1',
    displayName: 'Google AI Studio (Gemini)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    catalogId: 'google-ai-studio',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    keys: [],
    ...overrides,
  };
}

function openrouter(): PoolProvider {
  return {
    id: 'or1',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    catalogId: 'openrouter',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    keys: [],
  };
}

describe('isGoogleAiStudioProvider', () => {
  it('detects Google providers and resolves single-model defaults', () => {
    expect(isGoogleAiStudioProvider(google())).toBe(true);
    expect(
      isGoogleAiStudioProvider(
        google({
          catalogId: undefined,
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        }),
      ),
    ).toBe(true);
    expect(isGoogleAiStudioProvider(openrouter())).toBe(false);

    expect(resolveProviderModels(google())).toEqual(['gemini-2.5-flash']);
    expect(isMultiModelActive(google())).toBe(false);

    // Must not return [] — empty list would skip the provider in resolveSlots
    // and surface "pool is empty" for DEFAULT_SETTINGS (model: '').
    expect(resolveProviderModels({ baseUrl: '', model: '' })).toEqual(['']);
    expect(resolveProviderModels(google({ model: '', models: undefined }))).toEqual(['']);
    expect(isMultiModelActive(google({ model: '', models: undefined }))).toBe(false);
  });

  it('returns ordered unique models for Google multi-model', () => {
    const p = google({
      model: 'gemini-2.5-flash',
      models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'],
    });
    expect(resolveProviderModels(p)).toEqual([
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ]);
    expect(isMultiModelActive(p)).toBe(true);
  });
});

describe('resolveModelStrategy / normalizeGoogleModels', () => {
  it('selects model strategy and normalizes Google/non-Google providers', () => {
    const multi = google({
      models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    });
    expect(resolveModelStrategy(multi)).toBe('preferred_failover');
    expect(resolveModelStrategy({ ...multi, modelStrategy: 'round_robin' })).toBe(
      'round_robin',
    );
    expect(resolveModelStrategy(google({ modelStrategy: 'round_robin' }))).toBe(
      'preferred_failover',
    );

    const n = normalizeGoogleModels(
      google({
        model: 'old',
        models: ['  gemini-2.5-flash  ', 'gemini-2.5-flash-lite', ''],
      }),
    );
    expect(n.model).toBe('gemini-2.5-flash');
    expect(n.models).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);

    const stripped = normalizeGoogleModels({
      ...openrouter(),
      models: ['a', 'b'],
      modelStrategy: 'round_robin',
    });
    expect(stripped.models).toBeUndefined();
    expect(stripped.modelStrategy).toBeUndefined();
  });

  it('uses keyId alone for single-model slots and composite IDs for multi-model slots', () => {
    expect(makeSlotId('k1', 'm', false)).toBe('k1');
    expect(makeSlotId('k1', 'gemini-2.5-flash', true)).toBe('k1::gemini-2.5-flash');
  });
});
