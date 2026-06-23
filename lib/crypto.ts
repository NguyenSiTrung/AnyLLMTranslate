/**
 * Extension storage encryption helpers for sensitive values.
 *
 * Uses PBKDF2 (SHA-256, 100k iterations) + AES-GCM-256.
 * The encryption key is derived from chrome.runtime.id + a per-install random
 * salt persisted in extension storage, so it is unique per install and stable
 * across sessions.
 *
 * Backward compatibility: values encrypted before the per-install salt was
 * introduced were derived from a static salt. Decryption transparently tries
 * the per-install salt first and falls back to the static salt, so legacy
 * `enc:` values still decrypt and are re-encrypted with the per-install salt on
 * the next save.
 */

import { STORAGE_KEYS } from './constants';

const ENCRYPTED_PREFIX = 'enc:';
/** Legacy static salt — retained for decrypting values written before per-install salts. */
const STATIC_SALT = new Uint8Array([
  0x41, 0x6e, 0x79, 0x4c, 0x4c, 0x4d, 0x54, 0x72,
  0x61, 0x6e, 0x73, 0x6c, 0x61, 0x74, 0x65, 0x21,
]);
const PBKDF2_ITERATIONS = 100_000;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

/** Cached per-install salt to avoid repeated storage reads. */
let cachedSalt: Uint8Array | null = null;

/** Result of attempting to decrypt a stored API key. */
export interface DecryptResult {
  /** Decrypted plaintext, or '' when an encrypted value could not be decrypted. */
  value: string;
  /** True if the value was returned successfully (plaintext or decrypted). */
  ok: boolean;
  /** True if the input was an encrypted value (carried the `enc:` prefix). */
  encrypted: boolean;
}

function getPassword(): string {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      return chrome.runtime.id;
    }
  } catch {
    // Fallback for non-extension contexts (tests, etc.)
  }
  return 'anyllm-fallback-password';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

/**
 * Return the per-install random salt, generating and persisting one on first use.
 * Falls back to the static salt when extension storage is unavailable.
 */
async function getOrCreateSalt(): Promise<Uint8Array> {
  if (cachedSalt) return cachedSalt;

  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const result = await chrome.storage.local.get(STORAGE_KEYS.ENC_SALT);
      const stored = result?.[STORAGE_KEYS.ENC_SALT] as string | undefined;
      if (stored) {
        cachedSalt = base64ToBytes(stored);
        return cachedSalt;
      }
      const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
      await chrome.storage.local.set({ [STORAGE_KEYS.ENC_SALT]: bytesToBase64(salt) });
      cachedSalt = salt;
      return cachedSalt;
    }
  } catch {
    // Storage unavailable — fall back to the static salt below.
  }

  cachedSalt = STATIC_SALT;
  return cachedSalt;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt a plaintext API key. Returns empty string for empty input. */
export async function encryptApiKey(plaintext: string): Promise<string> {
  if (!plaintext) return plaintext;

  const salt = await getOrCreateSalt();
  const key = await deriveKey(getPassword(), salt);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return ENCRYPTED_PREFIX + bytesToBase64(combined);
}

async function tryDecrypt(combined: Uint8Array, salt: Uint8Array): Promise<string> {
  const key = await deriveKey(getPassword(), salt);
  const iv = combined.slice(0, IV_LENGTH);
  const encrypted = combined.slice(IV_LENGTH);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted,
  );
  return new TextDecoder().decode(decrypted);
}

/**
 * Decrypt an API key, reporting whether the input was encrypted and whether
 * decryption succeeded.
 *
 * - Plaintext (no `enc:` prefix) → `{ value, ok: true, encrypted: false }`.
 * - Encrypted and decryptable → `{ value, ok: true, encrypted: true }`.
 * - Encrypted but undecryptable → `{ value: '', ok: false, encrypted: true }`.
 *
 * Callers should treat the undecryptable case as a recoverable not-configured
 * state rather than using the ciphertext as a usable API key.
 */
export async function decryptApiKeyResult(value: string): Promise<DecryptResult> {
  if (!value || !value.startsWith(ENCRYPTED_PREFIX)) {
    return { value, ok: true, encrypted: false };
  }

  let combined: Uint8Array;
  try {
    combined = base64ToBytes(value.slice(ENCRYPTED_PREFIX.length));
  } catch {
    return { value: '', ok: false, encrypted: true };
  }

  // Per-install salt first, then the legacy static salt for backward compatibility.
  try {
    const salt = await getOrCreateSalt();
    return { value: await tryDecrypt(combined, salt), ok: true, encrypted: true };
  } catch {
    // fall through to legacy salt
  }

  try {
    return { value: await tryDecrypt(combined, STATIC_SALT), ok: true, encrypted: true };
  } catch {
    return { value: '', ok: false, encrypted: true };
  }
}

/**
 * Decrypt an API key.
 * If the input is not prefixed with 'enc:', returns it as-is (backward compat).
 * If decryption fails, returns '' (P2: previously returned the raw ciphertext,
 * which a caller could then send as the API key — a security risk). Prefer
 * {@link decryptApiKeyResult} when you need to detect undecryptable values.
 */
export async function decryptApiKey(ciphertext: string): Promise<string> {
  const result = await decryptApiKeyResult(ciphertext);
  if (result.encrypted && !result.ok) return '';
  return result.value;
}

/** Reset the cached salt. Exported for tests. */
export function __resetSaltCacheForTest(): void {
  cachedSalt = null;
}
