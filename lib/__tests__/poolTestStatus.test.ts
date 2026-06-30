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
    enabled: true,
    lastTestResult: { success: true, at: 1700000000000, latencyMs: 100 },
    ...overrides,
  };
}

describe('providerCredentialsChanged', () => {
  it('returns false when baseUrl, model, requiresApiKey are unchanged', () => {
    const p = makeProvider();
    expect(providerCredentialsChanged(p, p)).toBe(false);
  });

  it('returns true when baseUrl changes', () => {
    const old = makeProvider();
    const next = makeProvider({ baseUrl: 'https://other/v1' });
    expect(providerCredentialsChanged(old, next)).toBe(true);
  });

  it('returns true when model changes', () => {
    const old = makeProvider();
    const next = makeProvider({ model: 'llama-3.1' });
    expect(providerCredentialsChanged(old, next)).toBe(true);
  });

  it('returns true when requiresApiKey changes', () => {
    const old = makeProvider();
    const next = makeProvider({ requiresApiKey: false });
    expect(providerCredentialsChanged(old, next)).toBe(true);
  });

  it('returns false when only irrelevant fields change', () => {
    const old = makeProvider();
    const next = makeProvider({ displayName: 'New', temperature: 0.7, enabled: false });
    expect(providerCredentialsChanged(old, next)).toBe(false);
  });
});

describe('keyCredentialsChanged', () => {
  it('returns false when apiKey is unchanged', () => {
    const k = makeKey();
    expect(keyCredentialsChanged(k, k)).toBe(false);
  });

  it('returns true when apiKey changes', () => {
    const old = makeKey();
    const next = makeKey({ apiKey: 'sk-new' });
    expect(keyCredentialsChanged(old, next)).toBe(true);
  });
});

describe('applyProviderPatch', () => {
  it('preserves lastTestResult when credentials are unchanged', () => {
    const p = makeProvider();
    const patched = applyProviderPatch(p, { displayName: 'Renamed' });
    expect(patched.lastTestResult).toEqual({ success: true, at: 1700000000000, latencyMs: 200 });
    expect(patched.displayName).toBe('Renamed');
  });

  it('clears lastTestResult when baseUrl changes', () => {
    const p = makeProvider();
    const patched = applyProviderPatch(p, { baseUrl: 'https://other/v1' });
    expect(patched.lastTestResult).toBeUndefined();
    expect(patched.baseUrl).toBe('https://other/v1');
  });

  it('clears lastTestResult when model changes', () => {
    const p = makeProvider();
    const patched = applyProviderPatch(p, { model: 'new-model' });
    expect(patched.lastTestResult).toBeUndefined();
  });

  it('clears lastTestResult when requiresApiKey changes', () => {
    const p = makeProvider();
    const patched = applyProviderPatch(p, { requiresApiKey: false });
    expect(patched.lastTestResult).toBeUndefined();
  });

  it('does not clear lastTestResult when patch has no credential fields', () => {
    const p = makeProvider();
    const patched = applyProviderPatch(p, { enabled: false, temperature: 0.9 });
    expect(patched.lastTestResult).toBeDefined();
  });

  it('does not clear lastTestResult when patch sets same values', () => {
    const p = makeProvider({ baseUrl: 'https://api.test.com/v1', model: 'gpt-4o-mini' });
    const patched = applyProviderPatch(p, { baseUrl: 'https://api.test.com/v1', model: 'gpt-4o-mini' });
    expect(patched.lastTestResult).toBeDefined();
  });
});

describe('applyKeyPatch', () => {
  it('preserves lastTestResult when apiKey is unchanged', () => {
    const k = makeKey();
    const patched = applyKeyPatch(k, { maxRpm: 60 });
    expect(patched.lastTestResult).toEqual({ success: true, at: 1700000000000, latencyMs: 100 });
    expect(patched.maxRpm).toBe(60);
  });

  it('clears lastTestResult when apiKey changes', () => {
    const k = makeKey();
    const patched = applyKeyPatch(k, { apiKey: 'sk-new' });
    expect(patched.lastTestResult).toBeUndefined();
    expect(patched.apiKey).toBe('sk-new');
  });

  it('does not clear lastTestResult when patch sets same apiKey', () => {
    const k = makeKey({ apiKey: 'sk-same' });
    const patched = applyKeyPatch(k, { apiKey: 'sk-same' });
    expect(patched.lastTestResult).toBeDefined();
  });

  it('does not clear lastTestResult when patch has no apiKey field', () => {
    const k = makeKey();
    const patched = applyKeyPatch(k, { enabled: false, label: 'prod' });
    expect(patched.lastTestResult).toBeDefined();
  });
});

describe('formatTestResultAge', () => {
  const baseAt = 1700000000000;

  it('returns "just now" for < 1 minute', () => {
    expect(formatTestResultAge({ success: true, at: baseAt }, baseAt + 30_000)).toBe('just now');
  });

  it('returns minutes for < 1 hour', () => {
    expect(formatTestResultAge({ success: true, at: baseAt }, baseAt + 5 * 60_000)).toBe('5m ago');
  });

  it('returns hours for < 1 day', () => {
    expect(formatTestResultAge({ success: true, at: baseAt }, baseAt + 3 * 3_600_000)).toBe('3h ago');
  });

  it('returns days for >= 1 day', () => {
    expect(formatTestResultAge({ success: true, at: baseAt }, baseAt + 2 * 86_400_000)).toBe('2d ago');
  });
});
