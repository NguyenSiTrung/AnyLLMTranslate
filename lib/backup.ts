/**
 * Settings backup serialization — full plaintext export and password-encrypted
 * backups (PBKDF2-SHA256 + AES-256-GCM).
 *
 * The encrypted envelope is self-contained (salt, IV, KDF params in the
 * header), so a backup decrypts on any browser/PC with the passphrase — no
 * per-install state required. This module never touches chrome.storage or
 * chrome.runtime, keeping it fully testable in node.
 */

import type { ExtensionSettings } from '@/types/config';
import { DEFAULT_SETTINGS } from '@/types/config';
import { deepMerge } from '@/lib/utils';
import { BUILT_IN_RULES } from '@/lib/siteRules';

export const BACKUP_FORMAT = 'anyllm-translate-backup';
export const BACKUP_VERSION = 1;
export const PBKDF2_ITERATIONS = 210_000;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

/** Thrown when an encrypted backup cannot be decrypted (wrong password or tamper). */
export class BackupDecryptError extends Error {
  constructor(message = 'Wrong password or corrupted file') {
    super(message);
    this.name = 'BackupDecryptError';
  }
}

export type BackupFormat = 'plain' | 'encrypted';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** True for plain JSON-shaped objects (settings data is JSON-shaped). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    !(v instanceof RegExp) &&
    !(v instanceof Map) &&
    !(v instanceof Set)
  );
}

/**
 * Structural equality for JSON-shaped settings values. Arrays compare
 * element-wise in order (deepMerge replaces arrays wholesale, so order
 * matters); plain objects compare own keys only (prototype-pollution safe).
 * Scalars use Object.is; anything non-JSON falls back to reference equality.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]),
    );
  }
  return false;
}

export interface ImportImpact {
  /** Recognized keys whose post-import value differs from the current value. */
  changed: string[];
  /** Replace mode only: customized keys absent from the file that reset to defaults. */
  resetToDefaults: string[];
}

/**
 * Compute what an import would change before it is applied, mirroring the
 * store's real semantics (lib/utils deepMerge: arrays overwritten, empty
 * source objects replace). Merge deep-merges onto current; replace resets to
 * defaults — with built-in site rules injected exactly like
 * settingsStore.replaceSettings — then applies the file.
 *
 * The `current` argument must be a loaded store state (site rules injected),
 * i.e. what pickKnownSettings produces.
 */
export function computeImportImpact(
  current: ExtensionSettings,
  recognized: Record<string, unknown>,
  mode: 'merge' | 'replace',
): ImportImpact {
  const baseline: ExtensionSettings =
    mode === 'replace'
      ? { ...DEFAULT_SETTINGS, siteRules: BUILT_IN_RULES.map((r) => ({ ...r })) }
      : current;

  const currentRecord = current as unknown as Record<string, unknown>;
  const baselineRecord = baseline as unknown as Record<string, unknown>;

  const changed: string[] = [];
  for (const [key, fileValue] of Object.entries(recognized)) {
    const currentValue = currentRecord[key];
    const baseValue = baselineRecord[key];
    let postImportValue: unknown;
    if (fileValue === undefined) {
      // deepMerge skips undefined source values: merge keeps current, replace keeps default.
      postImportValue = mode === 'merge' ? currentValue : baseValue;
    } else if (isPlainObject(baseValue) && isPlainObject(fileValue)) {
      postImportValue = deepMerge(baseValue, fileValue);
    } else {
      postImportValue = fileValue;
    }
    if (!deepEqual(currentValue, postImportValue)) changed.push(key);
  }

  let resetToDefaults: string[] = [];
  if (mode === 'replace') {
    resetToDefaults = Object.keys(DEFAULT_SETTINGS).filter(
      (key) =>
        !Object.prototype.hasOwnProperty.call(recognized, key) &&
        !deepEqual(currentRecord[key], baselineRecord[key]),
    );
  }

  return { changed, resetToDefaults };
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

function assertPassword(password: string): void {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
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

/** Serialize full settings to a JSON string (the plaintext export body). */
export function serializeSettings(settings: ExtensionSettings): string {
  return JSON.stringify(settings, null, 2);
}

/** Identify whether a settings/backup file is an encrypted envelope. */
export function detectFormat(text: string): BackupFormat {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      parsed['format'] === BACKUP_FORMAT &&
      typeof parsed['ciphertext'] === 'string'
    ) {
      return 'encrypted';
    }
  } catch {
    // Malformed JSON is treated as plain; it fails the object check on import.
  }
  return 'plain';
}

/** Encrypt full settings into a self-contained backup envelope. */
export async function encryptBackup(
  settings: ExtensionSettings,
  password: string,
): Promise<string> {
  assertPassword(password);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);

  const aad = new TextEncoder().encode(`${BACKUP_FORMAT}:${BACKUP_VERSION}`);
  const plaintext = new TextEncoder().encode(serializeSettings(settings));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      additionalData: aad,
    },
    key,
    plaintext,
  );

  const envelope = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope, null, 2);
}

/** Decrypt a backup envelope back to full settings. Throws BackupDecryptError on any failure. */
export async function decryptBackup(
  text: string,
  password: string,
): Promise<ExtensionSettings> {
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new BackupDecryptError();
  }
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    Array.isArray(envelope) ||
    envelope['format'] !== BACKUP_FORMAT
  ) {
    throw new BackupDecryptError();
  }
  if (envelope['version'] !== BACKUP_VERSION) {
    throw new BackupDecryptError('Unsupported backup version');
  }

  let salt: Uint8Array | null = null;
  let iv: Uint8Array | null = null;
  let ciphertext: Uint8Array | null = null;
  try {
    if (typeof envelope['salt'] === 'string') salt = base64ToBytes(envelope['salt']);
    if (typeof envelope['iv'] === 'string') iv = base64ToBytes(envelope['iv']);
    if (typeof envelope['ciphertext'] === 'string') {
      ciphertext = base64ToBytes(envelope['ciphertext']);
    }
  } catch {
    throw new BackupDecryptError();
  }
  if (!salt || !iv || !ciphertext) throw new BackupDecryptError();

  try {
    const key = await deriveKey(password, salt);
    const aad = new TextEncoder().encode(`${BACKUP_FORMAT}:${BACKUP_VERSION}`);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
        additionalData: aad,
      },
      key,
      ciphertext as unknown as BufferSource,
    );
    const parsed: unknown = JSON.parse(new TextDecoder().decode(decrypted));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('decrypted payload is not an object');
    }
    return parsed as ExtensionSettings;
  } catch {
    // GCM auth failure covers wrong password, tamper, and malformed payloads.
    throw new BackupDecryptError();
  }
}

/** Split a parsed settings object into recognized vs ignored keys (prototype-pollution safe). */
export function sanitizeImportObject(
  parsed: unknown,
): { recognized: Record<string, unknown>; ignored: string[] } {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Settings file must be a JSON object');
  }
  const knownKeys = new Set(Object.keys(DEFAULT_SETTINGS));
  const recognized: Record<string, unknown> = {};
  const ignored: string[] = [];
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (knownKeys.has(key)) recognized[key] = value;
    else ignored.push(key);
  }
  return { recognized, ignored };
}
