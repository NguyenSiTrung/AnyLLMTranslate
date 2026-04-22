/**
 * Extension storage encryption helpers for sensitive values.
 *
 * Uses PBKDF2 (SHA-256, 100k iterations) + AES-GCM-256.
 * The encryption key is derived from chrome.runtime.id + a static salt,
 * so it is unique per extension install but stable across sessions.
 */

const ENCRYPTED_PREFIX = 'enc:';
const STATIC_SALT = new Uint8Array([
  0x41, 0x6e, 0x79, 0x4c, 0x4c, 0x4d, 0x54, 0x72,
  0x61, 0x6e, 0x73, 0x6c, 0x61, 0x74, 0x65, 0x21,
]);
const PBKDF2_ITERATIONS = 100_000;
const IV_LENGTH = 12;

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

async function deriveKey(password: string): Promise<CryptoKey> {
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
      salt: STATIC_SALT,
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

  const key = await deriveKey(getPassword());
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

  return ENCRYPTED_PREFIX + btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt an API key.
 * If the input is not prefixed with 'enc:', returns it as-is (backward compat).
 * If decryption fails, returns the raw value (graceful fallback).
 */
export async function decryptApiKey(ciphertext: string): Promise<string> {
  if (!ciphertext || !ciphertext.startsWith(ENCRYPTED_PREFIX)) {
    return ciphertext;
  }

  try {
    const key = await deriveKey(getPassword());
    const data = Uint8Array.from(
      atob(ciphertext.slice(ENCRYPTED_PREFIX.length)),
      (c) => c.charCodeAt(0),
    );
    const iv = data.slice(0, IV_LENGTH);
    const encrypted = data.slice(IV_LENGTH);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted,
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return ciphertext;
  }
}
