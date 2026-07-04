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

  // Regression: a provider-level "Test connection" that passes after a
  // previously-failing per-key test must flip the badge from "failed" to
  // "healthy". Previously provider.lastTestResult was only consulted in the
  // untested guard, so the stale key failure kept the header stuck on red.
  it('is healthy when the provider-level test succeeds but keys still carry stale failures', () => {
    const p = makeProvider({
      keys: [
        { id: 'k1', apiKey: 'sk', maxRpm: 0, enabled: true, lastTestResult: { success: false, at: 1, error: 'x' } },
      ],
      lastTestResult: { success: true, at: 2, latencyMs: 42 },
    });
    const status = getProviderTestStatus(p);
    expect(status.state).toBe('healthy');
    expect(status.result?.at).toBe(2);
    expect(status.result?.latencyMs).toBe(42);
  });

  it('is healthy when only the provider-level test has run (no key results)', () => {
    const p = makeProvider({
      keys: [{ id: 'k1', apiKey: 'sk', maxRpm: 0, enabled: true }],
      lastTestResult: { success: true, at: 5, latencyMs: 7 },
    });
    const status = getProviderTestStatus(p);
    expect(status.state).toBe('healthy');
    expect(status.result?.at).toBe(5);
  });

  it('shows the most recent success when multiple results exist', () => {
    const p = makeProvider({
      keys: [
        { id: 'k1', apiKey: 'sk', maxRpm: 0, enabled: true, lastTestResult: { success: true, at: 3, latencyMs: 50 } },
        { id: 'k2', apiKey: 'sk', maxRpm: 0, enabled: true, lastTestResult: { success: true, at: 8, latencyMs: 20 } },
      ],
      lastTestResult: { success: true, at: 1, latencyMs: 99 },
    });
    const status = getProviderTestStatus(p);
    expect(status.state).toBe('healthy');
    expect(status.result?.at).toBe(8);
    expect(status.result?.latencyMs).toBe(20);
  });

  it('shows the most recent failure when all results failed', () => {
    const p = makeProvider({
      keys: [
        { id: 'k1', apiKey: 'sk', maxRpm: 0, enabled: true, lastTestResult: { success: false, at: 9, error: 'new' } },
        { id: 'k2', apiKey: 'sk', maxRpm: 0, enabled: true, lastTestResult: { success: false, at: 4, error: 'old' } },
      ],
      lastTestResult: { success: false, at: 6, error: 'mid' },
    });
    const status = getProviderTestStatus(p);
    expect(status.state).toBe('failed');
    expect(status.result?.at).toBe(9);
    expect(status.result?.error).toBe('new');
  });

  it('treats a newer per-key failure followed by a newer provider-level success as healthy', () => {
    // user runs a failing per-key test, then runs the provider-level test
    // which passes — header should reflect the latest provider-level success.
    const p = makeProvider({
      keys: [
        { id: 'k1', apiKey: 'sk', maxRpm: 0, enabled: true, lastTestResult: { success: false, at: 10, error: 'x' } },
      ],
      lastTestResult: { success: true, at: 11, latencyMs: 30 },
    });
    const status = getProviderTestStatus(p);
    expect(status.state).toBe('healthy');
    expect(status.result?.at).toBe(11);
  });
});
