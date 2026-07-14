import { describe, it, expect } from 'vitest';
import {
  providerCredentialsChanged,
  keyCredentialsChanged,
  applyProviderPatch,
  applyKeyPatch,
  formatTestResultAge,
} from '../poolTestStatus';
import type { PoolProvider, PoolKey } from '@/types/config';

function makeProvider(overrides: Partial<PoolProvider> = {}): PoolProvider {
  return {
    id: 'p1',
    displayName: 'P1',
    baseUrl: 'https://api.test.com/v1',
    model: 'gpt-4o-mini',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    keys: [],
    lastTestResult: { success: true, at: 1700000000000, latencyMs: 200 },
    ...overrides,
  };
}

function makeKey(overrides: Partial<PoolKey> = {}): PoolKey {
  return {
    id: 'k1',
    apiKey: 'sk-old',
    maxRpm: 0,
    concurrencyLimit: 0,
    interval: 0,
    enabled: true,
    lastTestResult: { success: true, at: 1700000000000, latencyMs: 100 },
    ...overrides,
  };
}

describe('poolTestStatus helpers', () => {
  it('detects credential changes, clears lastTestResult, and formats ages', () => {
    const old = makeProvider();
    expect(providerCredentialsChanged(old, old)).toBe(false);
    expect(providerCredentialsChanged(old, makeProvider({ baseUrl: 'https://other/v1' }))).toBe(
      true,
    );
    expect(providerCredentialsChanged(old, makeProvider({ model: 'llama-3.1' }))).toBe(true);
    expect(providerCredentialsChanged(old, makeProvider({ requiresApiKey: false }))).toBe(true);
    expect(
      providerCredentialsChanged(old, makeProvider({ displayName: 'New', temperature: 0.7 })),
    ).toBe(false);

    const k = makeKey();
    expect(keyCredentialsChanged(k, k)).toBe(false);
    expect(keyCredentialsChanged(k, makeKey({ apiKey: 'sk-new' }))).toBe(true);

    const p = makeProvider();
    expect(applyProviderPatch(p, { displayName: 'Renamed' }).lastTestResult).toBeDefined();
    expect(applyProviderPatch(p, { baseUrl: 'https://other/v1' }).lastTestResult).toBeUndefined();
    expect(applyKeyPatch(k, { maxRpm: 60 }).lastTestResult).toBeDefined();
    expect(applyKeyPatch(k, { apiKey: 'sk-new' }).lastTestResult).toBeUndefined();
    expect(applyKeyPatch(k, { apiKey: 'sk-old' }).lastTestResult).toBeDefined();

    const at = 1700000000000;
    expect(formatTestResultAge({ success: true, at }, at + 30_000)).toBe('just now');
    expect(formatTestResultAge({ success: true, at }, at + 5 * 60_000)).toBe('5m ago');
    expect(formatTestResultAge({ success: true, at }, at + 3 * 3_600_000)).toBe('3h ago');
    expect(formatTestResultAge({ success: true, at }, at + 2 * 86_400_000)).toBe('2d ago');
  });
});
