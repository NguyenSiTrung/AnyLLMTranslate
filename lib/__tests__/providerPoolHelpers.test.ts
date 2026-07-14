/**
 * Pure provider-pool UI helpers (FR-1).
 */

import { describe, expect, it } from 'vitest';
import {
  buildProviderConfig,
  canRunConnectionTest,
  getCredentialKey,
  getProviderTestStatus,
} from '../providerPoolHelpers';
import type { PoolProvider } from '@/types/config';

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

describe('provider pool UI helpers', () => {
  it('picks credentials, gates connection tests, and builds provider config', () => {
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
    expect(
      canRunConnectionTest(p, {
        id: 'k2',
        apiKey: '',
        maxRpm: 0,
        concurrencyLimit: 0,
        interval: 0,
        enabled: true,
      }),
    ).toBe(false);

    const cfg = buildProviderConfig(p, p.keys[0]!);
    expect(cfg.maxRpm).toBe(60);
    expect(cfg.baseUrl).toBe(p.baseUrl);
    expect(cfg.apiKey).toBe('sk-test');
  });

  it('aggregates provider test status (latest key wins; provider pass overrides stale key fail)', () => {
    expect(getProviderTestStatus(makeProvider()).state).toBe('untested');

    const healthy = makeProvider({
      keys: [
        {
          id: 'k1',
          apiKey: 'sk',
          maxRpm: 0,
          concurrencyLimit: 0,
          interval: 0,
          enabled: true,
          lastTestResult: { success: false, at: 1, error: 'x' },
        },
        {
          id: 'k2',
          apiKey: 'sk',
          maxRpm: 0,
          concurrencyLimit: 0,
          interval: 0,
          enabled: true,
          lastTestResult: { success: true, at: 2, latencyMs: 5 },
        },
      ],
    });
    expect(getProviderTestStatus(healthy).state).toBe('healthy');

    const providerLevel = makeProvider({
      keys: [
        {
          id: 'k1',
          apiKey: 'sk',
          maxRpm: 0,
          concurrencyLimit: 0,
          interval: 0,
          enabled: true,
          lastTestResult: { success: false, at: 1, error: 'x' },
        },
      ],
      lastTestResult: { success: true, at: 2, latencyMs: 42 },
    });
    expect(getProviderTestStatus(providerLevel).state).toBe('healthy');
    expect(getProviderTestStatus(providerLevel).result?.at).toBe(2);

    const failed = makeProvider({
      keys: [
        {
          id: 'k1',
          apiKey: 'sk',
          maxRpm: 0,
          concurrencyLimit: 0,
          interval: 0,
          enabled: true,
          lastTestResult: { success: false, at: 9, error: 'new' },
        },
        {
          id: 'k2',
          apiKey: 'sk',
          maxRpm: 0,
          concurrencyLimit: 0,
          interval: 0,
          enabled: true,
          lastTestResult: { success: false, at: 4, error: 'old' },
        },
      ],
    });
    expect(getProviderTestStatus(failed).state).toBe('failed');
    expect(getProviderTestStatus(failed).result?.at).toBe(9);
  });
});
