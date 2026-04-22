/**
 * Tests: API key encryption at rest (Phase C)
 *
 * Verifies round-trip encrypt/decrypt and backward compatibility
 * with plaintext keys.
 */
import { describe, it, expect } from 'vitest';
import { encryptApiKey, decryptApiKey } from '@/lib/crypto';

describe('crypto — API key encryption', () => {
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
});
