import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  encryptApiKey,
  decryptApiKey,
  decryptApiKeyResult,
  __resetSaltCacheForTest,
} from '@/lib/crypto';
import { STORAGE_KEYS } from '@/lib/constants';
import { passphraseStrength } from '../passphraseStrength';

/**
 * Tests: API key encryption at rest
 */

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

  it('round-trips keys, preserves empty/plaintext, random IV, salt reuse, fails closed, and reports plaintext/success/failure with extension-id rotation', async () => {
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

    // decryptApiKeyResult: plaintext/success/failure reporting
    expect(await decryptApiKeyResult('plain-key')).toEqual({
      value: 'plain-key',
      ok: true,
      encrypted: false,
    });

    const okEncrypted = await encryptApiKey('sk-success');
    const ok = await decryptApiKeyResult(okEncrypted);
    expect(ok).toEqual({ value: 'sk-success', ok: true, encrypted: true });

    const bad = await decryptApiKeyResult('enc:not-valid-base64!!!');
    expect(bad).toEqual({ value: '', ok: false, encrypted: true });

    // Extension-id rotation: a key encrypted under one extension id fails to
    // decrypt after the id changes.
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

describe('passphraseStrength', () => {
  it('returns null for empty input (meter hidden) and classifies weak, fair, and strong passphrases by length and character classes', () => {
    expect(passphraseStrength('')).toBeNull();

    // weak: under 8 chars, or 8+ with a single class below 12 chars
    expect(passphraseStrength('abc')).toBe('weak');
    expect(passphraseStrength('abcdefgh')).toBe('weak');

    // fair: 8+ with two classes, or 12+ with fewer than three classes
    expect(passphraseStrength('abcd1234')).toBe('fair');
    expect(passphraseStrength('Abcdefgh')).toBe('fair');
    expect(passphraseStrength('abcdefghijkl')).toBe('fair');
    expect(passphraseStrength('abcdefghij12')).toBe('fair');

    // strong: 12+ chars with three or more classes
    expect(passphraseStrength('Abcdefg12345')).toBe('strong');
    expect(passphraseStrength('abcd1234!@#$')).toBe('strong');
  });
});
