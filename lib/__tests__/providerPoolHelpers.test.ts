/**
 * Tests for the pure provider-pool UI helpers extracted in FR-1.
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
    keys: [{ id: 'k1', apiKey: 'sk-test', maxRpm: 60, enabled: true }],
    ...overrides,
  };
}

describe('getCredentialKey', () => {
  it('returns the first key with a non-empty apiKey when a key is required', () => {
    const p = makeProvider({
      keys: [
        { id: 'k1', apiKey: '', maxRpm: 0, enabled: true },
        { id: 'k2', apiKey: 'sk-2', maxRpm: 0, enabled: true },
      ],
    });
    expect(getCredentialKey(p)?.id).toBe('k2');
  });

  it('returns the first key for a keyless provider regardless of apiKey', () => {
    const p = makeProvider({
      requiresApiKey: false,
      keys: [{ id: 'k1', apiKey: '', maxRpm: 0, enabled: true }],
    });
    expect(getCredentialKey(p)?.id).toBe('k1');
  });

  it('returns undefined when a key is required but none has credentials', () => {
    const p = makeProvider({
      keys: [{ id: 'k1', apiKey: '', maxRpm: 0, enabled: true }],
    });
    expect(getCredentialKey(p)).toBeUndefined();
  });
});

describe('buildProviderConfig', () => {
  it('builds a ProviderConfig from a provider + key, carrying maxRpm from the key', () => {
    const p = makeProvider();
    const key = p.keys[0];
    const cfg = buildProviderConfig(p, key);
    expect(cfg).toEqual({
      preset: 'custom',
      baseUrl: p.baseUrl,
      apiKey: key.apiKey,
      model: p.model,
      temperature: p.temperature,
      maxTokens: p.maxTokens,
      displayName: p.displayName,
      requiresApiKey: p.requiresApiKey,
      requestTimeoutMs: p.requestTimeoutMs,
      maxRpm: key.maxRpm,
    });
  });
});

describe('canRunConnectionTest', () => {
  it('is false when baseUrl is empty', () => {
    expect(canRunConnectionTest(makeProvider({ baseUrl: '' }))).toBe(false);
  });

  it('is false when model is empty', () => {
    expect(canRunConnectionTest(makeProvider({ model: '' }))).toBe(false);
  });

  it('is true for a keyless provider with url+model and no specific key', () => {
    expect(canRunConnectionTest(makeProvider({ requiresApiKey: false }))).toBe(true);
  });

  it('respects a specific key credential gate', () => {
    const p = makeProvider();
    expect(canRunConnectionTest(p, p.keys[0])).toBe(true);
    expect(
      canRunConnectionTest(p, { id: 'k2', apiKey: '', maxRpm: 0, enabled: true }),
    ).toBe(false);
  });
});

describe('getProviderTestStatus', () => {
  it('is untested when no key or provider has a lastTestResult', () => {
    expect(getProviderTestStatus(makeProvider()).state).toBe('untested');
  });

  it('is healthy when at least one key succeeded', () => {
    const p = makeProvider({
      keys: [
        { id: 'k1', apiKey: 'sk', maxRpm: 0, enabled: true, lastTestResult: { success: false, at: 1, error: 'x' } },
        { id: 'k2', apiKey: 'sk', maxRpm: 0, enabled: true, lastTestResult: { success: true, at: 2, latencyMs: 5 } },
      ],
    });
    expect(getProviderTestStatus(p).state).toBe('healthy');
    expect(getProviderTestStatus(p).result?.at).toBe(2);
  });

  it('is failed when every tested key failed', () => {
    const p = makeProvider({
      keys: [
        { id: 'k1', apiKey: 'sk', maxRpm: 0, enabled: true, lastTestResult: { success: false, at: 1, error: 'x' } },
        { id: 'k2', apiKey: 'sk', maxRpm: 0, enabled: true, lastTestResult: { success: false, at: 2, error: 'y' } },
      ],
    });
    expect(getProviderTestStatus(p).state).toBe('failed');
  });
});
