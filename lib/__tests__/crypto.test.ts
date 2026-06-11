/**
 * Tests: API key encryption at rest
 *
 * Verifies round-trip encrypt/decrypt, backward compatibility with plaintext
 * keys, per-install salt generation/persistence, recoverable decrypt failures,
 * and key rotation when the extension ID changes.
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

  it('round-trips a plaintext key', async () => {
    const plaintext = 'sk-test-12345abcdef';
    const encrypted = await encryptApiKey(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toMatch(/^enc:/);

    const decrypted = await decryptApiKey(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('returns empty string unchanged', async () => {
    expect(await encryptApiKey('')).toBe('');
    expect(await decryptApiKey('')).toBe('');
  });

  it('returns plaintext unchanged (backward compat)', async () => {
    const plaintext = 'plain-api-key-no-prefix';
    expect(await decryptApiKey(plaintext)).toBe(plaintext);
  });

  it('produces different ciphertexts for same plaintext (random IV)', async () => {
    const plaintext = 'same-key';
    const encrypted1 = await encryptApiKey(plaintext);
    const encrypted2 = await encryptApiKey(plaintext);
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('gracefully returns raw value on decryption failure', async () => {
    const corrupted = 'enc:not-valid-base64!!!';
    expect(await decryptApiKey(corrupted)).toBe(corrupted);
  });

  describe('per-install salt', () => {
    it('generates and persists a random salt on first encryption', async () => {
      const store = installStorageMock();
      __resetSaltCacheForTest();
      expect(store[STORAGE_KEYS.ENC_SALT]).toBeUndefined();

      await encryptApiKey('sk-generate-salt');

      expect(store[STORAGE_KEYS.ENC_SALT]).toBeTypeOf('string');
    });

    it('reuses the persisted salt across module cache resets', async () => {
      const store = installStorageMock();
      __resetSaltCacheForTest();
      const encrypted = await encryptApiKey('sk-persist');
      const savedSalt = store[STORAGE_KEYS.ENC_SALT];

      // Simulate a fresh session: drop the cache but keep stored salt.
      __resetSaltCacheForTest();
      expect(store[STORAGE_KEYS.ENC_SALT]).toBe(savedSalt);
      expect(await decryptApiKey(encrypted)).toBe('sk-persist');
    });
  });

  describe('decryptApiKeyResult', () => {
    it('reports plaintext as not-encrypted and ok', async () => {
      const result = await decryptApiKeyResult('plain-key');
      expect(result).toEqual({ value: 'plain-key', ok: true, encrypted: false });
    });

    it('reports successful decryption of an encrypted value', async () => {
      const encrypted = await encryptApiKey('sk-success');
      const result = await decryptApiKeyResult(encrypted);
      expect(result.ok).toBe(true);
      expect(result.encrypted).toBe(true);
      expect(result.value).toBe('sk-success');
    });

    it('reports an undecryptable encrypted value as a recoverable failure', async () => {
      const result = await decryptApiKeyResult('enc:not-valid-base64!!!');
      expect(result.ok).toBe(false);
      expect(result.encrypted).toBe(true);
      expect(result.value).toBe('');
    });

    it('fails to decrypt when the extension ID changes (key rotation)', async () => {
      installStorageMock();
      __resetSaltCacheForTest();
      (chrome.runtime as { id: string }).id = 'original-extension-id';
      const encrypted = await encryptApiKey('sk-rotated');

      // Same install salt, different runtime id → derived key differs → fails.
      (chrome.runtime as { id: string }).id = 'different-extension-id';
      const result = await decryptApiKeyResult(encrypted);
      expect(result.ok).toBe(false);
      expect(result.value).toBe('');
    });
  });
});
