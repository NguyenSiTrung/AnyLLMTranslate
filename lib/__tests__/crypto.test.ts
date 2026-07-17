/**
 * Tests: API key encryption at rest
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  encryptApiKey,
  decryptApiKey,
  decryptApiKeyResult,
  __resetSaltCacheForTest,
} from '@/lib/crypto';
import { STORAGE_KEYS } from '@/lib/constants';

/** In-memory chrome.storage.local backing store for salt persistence tests. */
function installStorageMock(): Record<string, unknown> {
  const store: Record<string, unknown> = {};
  global.chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        }),
      },
    },
    runtime: { id: 'test-extension-id' },
  } as unknown as typeof chrome;
  return store;
}

describe('crypto — API key encryption', () => {
  beforeEach(() => {
    __resetSaltCacheForTest();
    installStorageMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips keys, preserves empty/plaintext, random IV, salt reuse, fails closed', async () => {
    const plaintext = 'sk-test-12345abcdef';
    const encrypted = await encryptApiKey(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toMatch(/^enc:/);
    expect(await decryptApiKey(encrypted)).toBe(plaintext);

    expect(await encryptApiKey('')).toBe('');
    expect(await decryptApiKey('')).toBe('');
    expect(await decryptApiKey('plain-api-key-no-prefix')).toBe('plain-api-key-no-prefix');

    const a = await encryptApiKey('same-key');
    const b = await encryptApiKey('same-key');
    expect(a).not.toBe(b);

    // Undecryptable ciphertext must not leak back as a pseudo API key.
    expect(await decryptApiKey('enc:not-valid-base64!!!')).toBe('');

    const store = installStorageMock();
    __resetSaltCacheForTest();
    expect(store[STORAGE_KEYS.ENC_SALT]).toBeUndefined();

    const persisted = await encryptApiKey('sk-persist');
    const savedSalt = store[STORAGE_KEYS.ENC_SALT];
    expect(savedSalt).toBeTypeOf('string');

    __resetSaltCacheForTest();
    expect(store[STORAGE_KEYS.ENC_SALT]).toBe(savedSalt);
    expect(await decryptApiKey(persisted)).toBe('sk-persist');
  });

  it('decryptApiKeyResult reports plaintext/success/failure and extension-id rotation', async () => {
    expect(await decryptApiKeyResult('plain-key')).toEqual({
      value: 'plain-key',
      ok: true,
      encrypted: false,
    });

    const encrypted = await encryptApiKey('sk-success');
    const ok = await decryptApiKeyResult(encrypted);
    expect(ok).toEqual({ value: 'sk-success', ok: true, encrypted: true });

    const bad = await decryptApiKeyResult('enc:not-valid-base64!!!');
    expect(bad).toEqual({ value: '', ok: false, encrypted: true });

    installStorageMock();
    __resetSaltCacheForTest();
    (chrome.runtime as { id: string }).id = 'original-extension-id';
    const rotated = await encryptApiKey('sk-rotated');
    (chrome.runtime as { id: string }).id = 'different-extension-id';
    const fail = await decryptApiKeyResult(rotated);
    expect(fail.ok).toBe(false);
    expect(fail.value).toBe('');
  });
});
