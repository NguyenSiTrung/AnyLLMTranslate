/**
 * Tests: full-settings backup encryption + import sanitizer.
 * Runs in the node env (default for lib/**); crypto.subtle is Node's global
 * webcrypto — no chrome mock required.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BACKUP_FORMAT,
  BackupDecryptError,
  computeImportImpact,
  deepEqual,
  decryptBackup,
  detectFormat,
  encryptBackup,
  pickKnownSettings,
  sanitizeImportObject,
  serializeSettings,
} from '@/lib/backup';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '@/types/config';
import { BUILT_IN_RULES } from '@/lib/siteRules';

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

  it('rejects tampered ciphertext, tampered AAD format marker, unknown version, and non-envelope plain JSON', async () => {
    // Tampered ciphertext must fail authentication.
    const tampered = JSON.parse(
      await encryptBackup(fullSettings(), PASSWORD),
    ) as Record<string, string>;
    const last = tampered['ciphertext'];
    const flipped = last.slice(0, -1) + (last.endsWith('A') ? 'B' : 'A');
    tampered['ciphertext'] = flipped;
    await expect(decryptBackup(JSON.stringify(tampered), PASSWORD)).rejects.toThrow(
      BackupDecryptError,
    );

    // AAD: format marker is bound to the ciphertext.
    const badFormat = JSON.parse(
      await encryptBackup(fullSettings(), PASSWORD),
    ) as Record<string, unknown>;
    badFormat['format'] = 'other-format';
    await expect(decryptBackup(JSON.stringify(badFormat), PASSWORD)).rejects.toThrow(
      BackupDecryptError,
    );

    // Unknown version is refused rather than guessed.
    const badVersion = JSON.parse(
      await encryptBackup(fullSettings(), PASSWORD),
    ) as Record<string, unknown>;
    badVersion['version'] = 99;
    await expect(decryptBackup(JSON.stringify(badVersion), PASSWORD)).rejects.toThrow(
      BackupDecryptError,
    );

    // Plain settings JSON is not an envelope.
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
  it('detects the encrypted envelope and treats plain settings, foreign formats, and non-JSON as plain', () => {
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

  it('rejects non-object payloads and accepts a full settings object untouched', () => {
    expect(() => sanitizeImportObject(null)).toThrow(/JSON object/);
    expect(() => sanitizeImportObject([1, 2])).toThrow(/JSON object/);
    expect(() => sanitizeImportObject('string')).toThrow(/JSON object/);

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

describe('deepEqual', () => {
  it('compares scalars with Object.is semantics and arrays element-wise, order-sensitive', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(0, -0)).toBe(false);
    expect(deepEqual(NaN, NaN)).toBe(true);

    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual([{ a: 1 }], [{ a: 1 }])).toBe(true);
  });

  it('compares nested plain objects by own keys and never compares inherited properties', () => {
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);

    const o = Object.create({ inherited: 1 }) as Record<string, unknown>;
    o.own = 1;
    expect(deepEqual(o, { own: 1 })).toBe(true);
  });
});

describe('computeImportImpact', () => {
  const customized = (): ExtensionSettings => ({
    ...DEFAULT_SETTINGS,
    targetLanguage: 'ja',
    theme: 'bubble',
    // Untouched built-in site rules — how a real loaded store looks.
    siteRules: BUILT_IN_RULES.map((r) => ({ ...r })),
  });

  it('merge: lists recognized keys whose imported value differs and omits unchanged keys', () => {
    const impact = computeImportImpact(customized(), { targetLanguage: 'ko' }, 'merge');
    expect(impact.changed).toEqual(['targetLanguage']);
    expect(impact.resetToDefaults).toEqual([]);

    const same = computeImportImpact(customized(), { targetLanguage: 'ja' }, 'merge');
    expect(same.changed).toEqual([]);
  });

  it('merge: a partial nested object that changes a nested field is listed as changed; undefined file values are no-ops', () => {
    const current = customized();
    current.pdfSettings = { ...DEFAULT_SETTINGS.pdfSettings, openMode: 'same-tab' };
    const impact = computeImportImpact(current, { pdfSettings: { autoOpen: 'prompt' } }, 'merge');
    expect(impact.changed).toEqual(['pdfSettings']);

    const noop = computeImportImpact(current, { targetLanguage: undefined }, 'merge');
    expect(noop.changed).toEqual([]);
  });

  it('replace: lists changed recognized keys against the defaults baseline and customized keys absent from the file as resetToDefaults', () => {
    const impact = computeImportImpact(customized(), { targetLanguage: 'ko' }, 'replace');
    expect(impact.changed).toEqual(['targetLanguage']);
    expect(impact.resetToDefaults).toContain('theme');
    expect(impact.resetToDefaults).not.toContain('targetLanguage');
  });

  it('replace: untouched built-in site rules are excluded; empty file warns every customized key (merge is a no-op); nothing customized means no warnings', () => {
    const current = customized();
    expect(computeImportImpact(current, { targetLanguage: 'ko' }, 'replace').resetToDefaults).not.toContain('siteRules');

    expect(computeImportImpact(current, {}, 'merge')).toEqual({
      changed: [],
      resetToDefaults: [],
    });
    const replace = computeImportImpact(current, {}, 'replace');
    expect(replace.changed).toEqual([]);
    expect(replace.resetToDefaults).toContain('theme');
    expect(replace.resetToDefaults).toContain('targetLanguage');

    const untouched = { ...DEFAULT_SETTINGS, siteRules: BUILT_IN_RULES.map((r) => ({ ...r })) };
    expect(computeImportImpact(untouched, {}, 'replace').resetToDefaults).toEqual([]);
  });
});

describe('pickKnownSettings', () => {
  it('picks every DEFAULT_SETTINGS key, excludes store internals, and falls back to DEFAULT_SETTINGS for missing keys', () => {
    const state = {
      ...DEFAULT_SETTINGS,
      safeKeyThrottleMigrated: true,
      isLoaded: true,
      updateSettings: () => {},
      replaceSettings: () => {},
    };
    const picked = pickKnownSettings(state as unknown as Record<string, unknown>);
    const keys = Object.keys(picked);
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      expect(keys).toContain(k);
    }
    expect(keys).not.toContain('isLoaded');
    expect(keys).not.toContain('updateSettings');
    expect(keys).not.toContain('replaceSettings');
    expect(picked.safeKeyThrottleMigrated).toBe(true);

    const fallback = pickKnownSettings({} as Record<string, unknown>);
    expect(fallback.targetLanguage).toBe('vi');
    expect(fallback.theme).toBe('blockquote');
    expect(fallback.siteRules).toEqual([]);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
