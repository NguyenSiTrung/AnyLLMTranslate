/**
 * Tests: full-settings backup encryption + import sanitizer.
 * Runs in the node env (default for lib/**); crypto.subtle is Node's global
 * webcrypto — no chrome mock required.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BACKUP_FORMAT,
  BackupDecryptError,
  decryptBackup,
  detectFormat,
  encryptBackup,
  sanitizeImportObject,
  serializeSettings,
} from '@/lib/backup';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '@/types/config';

const PASSWORD = 'correct horse battery staple';

function fullSettings(): ExtensionSettings {
  return {
    ...DEFAULT_SETTINGS,
    targetLanguage: 'ja',
    theme: 'bubble',
    siteRules: [
      {
        id: 'r1',
        hostname: '*.example.com',
        includeSelectors: ['article'],
        excludeSelectors: [],
        alwaysTranslate: true,
        neverTranslate: false,
        builtIn: false,
      },
    ],
    glossary: [{ id: 'g1', source: 'hello', target: 'こんにちは' }],
    providers: [
      {
        id: 'p1',
        displayName: 'My Provider',
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-4o-mini',
        requiresApiKey: true,
        temperature: 0.3,
        maxTokens: 4096,
        enabled: true,
        keys: [
          {
            id: 'k1',
            apiKey: 'sk-secret-1',
            maxRpm: 20,
            concurrencyLimit: 1,
            interval: 500,
            enabled: true,
          },
        ],
      },
    ],
    tts: {
      ...DEFAULT_SETTINGS.tts,
      enabled: true,
      customApiKey: 'tts-secret',
      languageOverrides: [{ language: 'vi', model: 'tts-1', voice: 'nova' }],
    },
  };
}

describe('encryptBackup / decryptBackup', () => {
  it('round-trips a full settings object including pool keys and TTS overrides', async () => {
    const source = fullSettings();
    const envelope = await encryptBackup(source, PASSWORD);
    const parsed = JSON.parse(envelope) as Record<string, unknown>;

    expect(parsed['format']).toBe(BACKUP_FORMAT);
    expect(parsed['version']).toBe(1);
    expect(parsed['kdf']).toBe('PBKDF2-SHA256');
    expect(typeof parsed['salt']).toBe('string');
    expect(typeof parsed['iv']).toBe('string');
    expect(typeof parsed['ciphertext']).toBe('string');
    // The envelope must NOT contain plaintext settings or keys.
    expect(envelope).not.toContain('sk-secret-1');
    expect(envelope).not.toContain('tts-secret');

    expect(await decryptBackup(envelope, PASSWORD)).toEqual(source);
  });

  it('throws on wrong password', async () => {
    const envelope = await encryptBackup(fullSettings(), PASSWORD);
    await expect(decryptBackup(envelope, 'wrong-password-123')).rejects.toThrow(
      BackupDecryptError,
    );
  });

  it('throws on tampered ciphertext', async () => {
    const envelope = JSON.parse(
      await encryptBackup(fullSettings(), PASSWORD),
    ) as Record<string, string>;
    const last = envelope['ciphertext'];
    const flipped = last.slice(0, -1) + (last.endsWith('A') ? 'B' : 'A');
    envelope['ciphertext'] = flipped;
    await expect(decryptBackup(JSON.stringify(envelope), PASSWORD)).rejects.toThrow(
      BackupDecryptError,
    );
  });

  it('throws when the format marker is tampered (AAD)', async () => {
    const envelope = JSON.parse(
      await encryptBackup(fullSettings(), PASSWORD),
    ) as Record<string, unknown>;
    envelope['format'] = 'other-format';
    await expect(decryptBackup(JSON.stringify(envelope), PASSWORD)).rejects.toThrow(
      BackupDecryptError,
    );
  });

  it('throws on unknown version', async () => {
    const envelope = JSON.parse(
      await encryptBackup(fullSettings(), PASSWORD),
    ) as Record<string, unknown>;
    envelope['version'] = 99;
    await expect(decryptBackup(JSON.stringify(envelope), PASSWORD)).rejects.toThrow(
      BackupDecryptError,
    );
  });

  it('throws on non-envelope plain JSON', async () => {
    await expect(decryptBackup('{"targetLanguage":"ja"}', PASSWORD)).rejects.toThrow(
      BackupDecryptError,
    );
  });

  it('rejects short passwords', async () => {
    await expect(encryptBackup(fullSettings(), 'short')).rejects.toThrow(
      /at least 8 characters/,
    );
  });
});

describe('detectFormat', () => {
  it('detects the encrypted envelope', () => {
    expect(
      detectFormat(
        JSON.stringify({
          format: BACKUP_FORMAT,
          version: 1,
          ciphertext: 'abc',
          salt: 's',
          iv: 'i',
        }),
      ),
    ).toBe('encrypted');
  });

  it('treats plain settings JSON as plain', () => {
    expect(detectFormat(JSON.stringify({ targetLanguage: 'ja' }))).toBe('plain');
    expect(detectFormat('{"format":"not-ours","ciphertext":"x"}')).toBe('plain');
    expect(detectFormat('not json at all')).toBe('plain');
  });
});

describe('sanitizeImportObject', () => {
  it('splits recognized vs ignored keys and drops prototype-pollution keys silently', () => {
    const parsed = {
      targetLanguage: 'ja',
      unknownSetting: 1,
      __proto__: { polluted: true },
      constructor: { x: 1 },
      prototype: { y: 2 },
    };
    const { recognized, ignored } = sanitizeImportObject(parsed);
    expect(recognized).toEqual({ targetLanguage: 'ja' });
    expect(ignored).toEqual(['unknownSetting']);
    // No pollution leaked into Object.prototype.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects non-object payloads', () => {
    expect(() => sanitizeImportObject(null)).toThrow(/JSON object/);
    expect(() => sanitizeImportObject([1, 2])).toThrow(/JSON object/);
    expect(() => sanitizeImportObject('string')).toThrow(/JSON object/);
  });

  it('accepts a full settings object untouched', () => {
    const { recognized, ignored } = sanitizeImportObject(fullSettings());
    expect(ignored).toEqual([]);
    expect(recognized['providers']).toEqual(fullSettings().providers);
  });
});

describe('serializeSettings', () => {
  it('emits pretty JSON containing every key', () => {
    const text = serializeSettings(fullSettings());
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed['providers']).toBeTruthy();
    expect(parsed['pdfSettings']).toBeTruthy();
    expect(parsed['scientificPdf']).toBeTruthy();
    expect(text).toContain('\n  ');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
