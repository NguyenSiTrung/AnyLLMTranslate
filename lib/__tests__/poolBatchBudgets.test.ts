import { describe, it, expect } from 'vitest';
import { resolvePoolBatchBudgets } from '../poolBatchBudgets';
import type { ExtensionSettings, PoolProvider } from '@/types/config';
import { DEFAULT_SETTINGS } from '@/types/config';

function settingsWithProviders(providers: PoolProvider[]): ExtensionSettings {
  return { ...DEFAULT_SETTINGS, providers };
}

describe('resolvePoolBatchBudgets', () => {
  it('uses global defaults when no provider override is set', () => {
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
  });

  it('uses the tightest enabled-provider override (min of positive values)', () => {
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
    expect(resolvePoolBatchBudgets(s)).toEqual({
      maxTextGroupLengthPerRequest: 2,
      maxTextLengthPerRequest: 800,
    });
  });
});
