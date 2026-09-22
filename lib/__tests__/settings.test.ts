import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_INLINE_TRANSLATE_SETTINGS, DEFAULT_SETTINGS, DEFAULT_CUSTOM_THEME, type InlineTranslateSettings, type ThemeName, type ExtensionSettings } from '@/types/config';
import { deepMerge } from '@/lib/utils';
import { loadSettings } from '@/lib/config';
import { parseLanguagePrefix, LANGUAGE_PREFIX_ALIASES } from '@/lib/inlineTranslatePrefix';
import { INLINE_PREVIEW_SOURCE, resolvePreviewTranslation, buildPreviewProjection } from '@/lib/inlineTranslatePreview';
import { applyPageScopePreset, detectPageScopePreset, PAGE_SCOPE_PRESET_OPTIONS } from '@/lib/pageScopePreset';
import { THEME_DEFINITIONS, getThemeDefinition, themeOptionsForSelect, themesByCategory } from '@/lib/themes';
import { customThemeFromPreset } from '@/lib/customThemePresets';
import { parseShortcutKeys, formatGestureLabel, buildGestureRow, buildGlobalRows, countGlobalBound, filterShortcutRows, formatCheatsheet, groupRowsByScope, PAGE_SHORTCUT_ROWS, DEFAULT_GLOBAL_SHORTCUTS, GLOBAL_COMMAND_ORDER } from '@/lib/shortcutDisplay';
import { BACKUP_FORMAT, BackupDecryptError, computeImportImpact, deepEqual, decryptBackup, detectFormat, encryptBackup, pickKnownSettings, sanitizeImportObject, serializeSettings } from '@/lib/backup';
import { BUILT_IN_RULES } from '@/lib/siteRules';

describe('InlineTranslate settings, prefix & preview helpers', () => {
    it('defaults, deep-merge partial storage, loadSettings fill, language prefixes, and preview projections', async () => {
    const d = DEFAULT_INLINE_TRANSLATE_SETTINGS;
    expect(d).toMatchObject({
      enabled: true,
      triggerKey: ' ',
      tapCount: 3,
      timeWindowMs: 1000,
      idleMs: 0,
      enableLanguagePrefix: true,
      languagePrefix: '/',
      dualMode: false,
      enableFallbackUndo: true,
    });
    expect(d.blocklistPatterns.length).toBeGreaterThan(0);

    const merged = deepMerge(
      DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      {
        inlineTranslate: {
          enabled: false,
          tapCount: 4,
        },
      } as Record<string, unknown>,
    ) as { inlineTranslate: InlineTranslateSettings };
    expect(merged.inlineTranslate.enabled).toBe(false);
    expect(merged.inlineTranslate.tapCount).toBe(4);
    expect(merged.inlineTranslate.idleMs).toBe(DEFAULT_INLINE_TRANSLATE_SETTINGS.idleMs);
    expect(merged.inlineTranslate.blocklistPatterns).toEqual(
      DEFAULT_INLINE_TRANSLATE_SETTINGS.blocklistPatterns,
    );

    const get = vi.fn().mockResolvedValue({
      'anyllm-translate-settings': {
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        inlineTranslate: {
          enabled: true,
          tapCount: 2,
        },
      },
    });
    Object.defineProperty(globalThis, 'chrome', {
      value: {
        storage: {
          local: { get, set: vi.fn() },
          session: { get: vi.fn(), set: vi.fn() },
        },
        runtime: { id: 'test-ext' },
      },
      writable: true,
      configurable: true,
    });
    const settings = await loadSettings();
    expect(settings.inlineTranslate.tapCount).toBe(2);
    expect(settings.inlineTranslate.idleMs).toBe(DEFAULT_INLINE_TRANSLATE_SETTINGS.idleMs);
        expect(settings.inlineTranslate.enableLanguagePrefix).toBe(true);

    // parses language prefixes, resolves preview samples, and builds projections
    expect(parseLanguagePrefix('/en hello world')).toMatchObject({
      targetLang: 'en',
      body: 'hello world',
      rawPrefix: '/en',
    });
    expect(parseLanguagePrefix('/zh 测试').targetLang).toBe('zh-CN');
    expect(parseLanguagePrefix('/中文 测试').targetLang).toBe('zh-CN');
    expect(parseLanguagePrefix('/vi xin chào').targetLang).toBe('vi');
    expect(parseLanguagePrefix('/sv hej').targetLang).toBe('sv');
    expect(parseLanguagePrefix('hello world').targetLang).toBeUndefined();
    expect(parseLanguagePrefix('/en hello', { enabled: false }).body).toBe('/en hello');
    expect(parseLanguagePrefix('/notalang hello').targetLang).toBeUndefined();
    expect(parseLanguagePrefix('/en')).toMatchObject({ targetLang: 'en', body: '' });
    expect(parseLanguagePrefix('#en hello', { prefixChar: '#' }).targetLang).toBe('en');
    expect(Object.keys(LANGUAGE_PREFIX_ALIASES).length).toBeGreaterThan(10);

    expect(resolvePreviewTranslation('vi')).toBeTruthy();
    expect(resolvePreviewTranslation('vi')).not.toContain('translated ·');
    expect(resolvePreviewTranslation('en')).toMatch(/hello/i);
    expect(resolvePreviewTranslation('xx')).toBe('(translated · xx)');

    const only = buildPreviewProjection({
      targetLanguage: 'vi',
      dualMode: false,
      enableLanguagePrefix: false,
      languagePrefix: '/',
    });
    expect(only.before).toBe(INLINE_PREVIEW_SOURCE);
    expect(only.after).toBe(resolvePreviewTranslation('vi'));
    expect(only.meta).toContain('vi');

    const dual = buildPreviewProjection({
      targetLanguage: 'vi',
      dualMode: true,
      enableLanguagePrefix: false,
      languagePrefix: '/',
    });
    expect(dual.after).toBe(`${INLINE_PREVIEW_SOURCE} / ${resolvePreviewTranslation('vi')}`);

    const prefix = buildPreviewProjection({
      targetLanguage: 'vi',
      dualMode: false,
      enableLanguagePrefix: true,
      languagePrefix: '/',
    });
    expect(prefix.before).toBe(`/en ${INLINE_PREVIEW_SOURCE}`);
    expect(prefix.after).toBe(resolvePreviewTranslation('en'));

    const prefixDual = buildPreviewProjection({
      targetLanguage: 'ja',
      dualMode: true,
      enableLanguagePrefix: true,
      languagePrefix: '#',
    });
    expect(prefixDual.before).toBe(`#en ${INLINE_PREVIEW_SOURCE}`);
    expect(prefixDual.after).toBe(`${INLINE_PREVIEW_SOURCE} / ${resolvePreviewTranslation('en')}`);

    const emptyPrefix = buildPreviewProjection({
      targetLanguage: 'en',
      dualMode: false,
      enableLanguagePrefix: true,
      languagePrefix: '',
    });
    expect(emptyPrefix.before.startsWith('/en ')).toBe(true);
  });
});

describe('pageScopePreset', () => {
  it('applies all presets, detects named presets/custom mix, and DEFAULT_SETTINGS as balanced', () => {
    expect(applyPageScopePreset('classic')).toEqual({
      enableStreamingTranslation: false,
      enableAsideCaps: false,
      enableBodyTagWhitelist: false,
      enableSmartExcludes: true,
    });

    const balanced = applyPageScopePreset('balanced');
    expect(balanced).toEqual({
      enableStreamingTranslation: true,
      enableAsideCaps: true,
      enableBodyTagWhitelist: false,
      enableSmartExcludes: true,
    });
    expect(DEFAULT_SETTINGS.enableStreamingTranslation).toBe(balanced.enableStreamingTranslation);
    expect(DEFAULT_SETTINGS.enableAsideCaps).toBe(balanced.enableAsideCaps);
    expect(DEFAULT_SETTINGS.enableBodyTagWhitelist).toBe(balanced.enableBodyTagWhitelist);
    expect(DEFAULT_SETTINGS.enableSmartExcludes).toBe(balanced.enableSmartExcludes);

    expect(applyPageScopePreset('main-content')).toMatchObject({
      enableBodyTagWhitelist: true,
      enableAsideCaps: true,
      enableSmartExcludes: true,
      enableStreamingTranslation: true,
    });
    expect(applyPageScopePreset('full-page')).toEqual({
      enableStreamingTranslation: true,
      enableAsideCaps: false,
      enableBodyTagWhitelist: false,
      enableSmartExcludes: false,
    });

    // detects named presets, custom mix, and DEFAULT_SETTINGS as balanced
    for (const { value } of PAGE_SCOPE_PRESET_OPTIONS) {
      expect(detectPageScopePreset(applyPageScopePreset(value))).toBe(value);
    }
    expect(
      detectPageScopePreset({
        enableStreamingTranslation: true,
        enableAsideCaps: false,
        enableBodyTagWhitelist: true,
        enableSmartExcludes: true,
      }),
    ).toBe('custom');
    expect(detectPageScopePreset(DEFAULT_SETTINGS)).toBe('balanced');
  });
});

const ALL_THEME_NAMES: ThemeName[] = [
  'dividing-line',
  'blockquote',
  'paper',
  'underline',
  'dashed-underline',
  'highlight',
  'wavy-underline',
  'bubble',
  'side-by-side',
  'mask',
  'fade-in',
  'italic',
  'dotted-border',
  'shadow-card',
  'minimal',
  'gradient-accent',
  'custom',
];

describe('themes catalog and custom preset mappings', () => {
  it('covers ThemeName catalog, General-tab options, Select shapes, category filters, and custom presets', () => {
    const ids = THEME_DEFINITIONS.map((t) => t.id);
    expect(ids.sort()).toEqual([...ALL_THEME_NAMES].sort());
    expect(new Set(ids).size).toBe(ALL_THEME_NAMES.length);

    expect(getThemeDefinition('mask')?.tip).toMatch(/hover|focus/i);
    expect(themeOptionsForSelect()).toHaveLength(16);
    expect(themesByCategory('all')).toHaveLength(17);

    // Presets
    expect(customThemeFromPreset('custom')).toEqual(DEFAULT_CUSTOM_THEME);
    const paper = customThemeFromPreset('paper');
    expect(paper.backgroundColor).not.toBe('transparent');
    expect(customThemeFromPreset('italic').fontStyle).toBe('italic');
  });
});

describe('shortcutDisplay', () => {
  it('parses chords/gestures, maps rows, counts/filters/groups, and formats cheatsheet', () => {
    expect(parseShortcutKeys('Alt+A')).toEqual(['Alt', 'A']);
    expect(parseShortcutKeys('Ctrl+Shift+Y')).toEqual(['Ctrl', 'Shift', 'Y']);
    expect(parseShortcutKeys('')).toEqual([]);
    expect(parseShortcutKeys('   ')).toEqual([]);
    expect(parseShortcutKeys('Space × 3')).toEqual(['Space × 3']);
    expect(parseShortcutKeys('MediaNextTrack')).toEqual(['MediaNextTrack']);
    expect(formatGestureLabel(3)).toBe('Space × 3');
    const row = buildGestureRow(3, 800);
    expect(row).toMatchObject({ scope: 'gesture', shortcut: 'Space × 3', keyLabel: 'Space × 3' });
    expect(row.description).toMatch(/800/);

    const rows = buildGlobalRows([
      { name: 'translate-page', shortcut: 'Alt+B', description: 'ignored if meta exists' },
      { name: 'translate-input-box', shortcut: '' },
    ]);
    expect(rows.find((r) => r.id === 'translate-page')).toMatchObject({
      shortcut: 'Alt+B',
      label: 'Translate page',
    });
    expect(rows.find((r) => r.id === 'translate-input-box')?.shortcut).toBe('');

    const defaults = buildGlobalRows([]);
    expect(defaults.map((r) => r.id)).toEqual([...GLOBAL_COMMAND_ORDER]);
    expect(defaults.find((r) => r.id === 'translate-page')?.shortcut).toBe(
      DEFAULT_GLOBAL_SHORTCUTS['translate-page'],
    );
    for (const r of defaults) {
      expect(r.shortcut).not.toMatch(/Alt\+T/i);
      expect(r.shortcut).not.toMatch(/Alt\+O/i);
    }

    const labels = PAGE_SHORTCUT_ROWS.map((r) => r.shortcut);
    expect(labels).toEqual(expect.arrayContaining(['Alt+H', 'Alt+D', 'Alt+Q', 'Escape']));
    expect(PAGE_SHORTCUT_ROWS.every((r) => r.scope === 'page')).toBe(true);

    // Counts bound globals, filters, groups scopes, and formats cheatsheet
    const sample = [...buildGlobalRows([]), ...PAGE_SHORTCUT_ROWS, buildGestureRow(3, 800)];

    const boundRows = buildGlobalRows([
      { name: 'translate-page', shortcut: 'Alt+A' },
      { name: 'translate-input-box', shortcut: '' },
    ]);
    const { bound, total } = countGlobalBound(boundRows);
    expect(total).toBe(5);
    expect(bound).toBeGreaterThanOrEqual(1);
    expect(bound).toBeLessThan(total);

    expect(filterShortcutRows(sample, '', 'page').every((r) => r.scope === 'page')).toBe(true);
    expect(
      filterShortcutRows(sample, 'hover', 'all').some((r) => r.label.toLowerCase().includes('hover')),
    ).toBe(true);
    expect(
      filterShortcutRows(sample, 'alt+h', 'all').some(
        (r) => r.id.includes('hover') || r.shortcut.toLowerCase() === 'alt+h',
      ),
    ).toBe(true);

    const allRows = filterShortcutRows(sample, '', 'all');
    const text = formatCheatsheet(allRows);
    expect(text).toContain('AnyLLMTranslate shortcuts');
    expect(text).toContain('Global');
    expect(text).toContain('Translate page:');
    expect(text).toContain('Page');
    expect(text).toContain('Gestures');
    expect(text).toMatch(/not set/i);

    const g = groupRowsByScope([
      ...buildGlobalRows([]).slice(0, 1),
      PAGE_SHORTCUT_ROWS[0]!,
      buildGestureRow(2, 500),
    ]);
    expect(g.global).toHaveLength(1);
    expect(g.page).toHaveLength(1);
    expect(g.gesture).toHaveLength(1);
  });
});

describe('deepMerge', () => {
  it('merges nested objects, replaces empty objects, and overwrites arrays', () => {
    expect(
      deepMerge({ a: { x: 1, y: 2 }, b: 1 } as Record<string, unknown>, { a: { y: 9, z: 3 } }),
    ).toEqual({ a: { x: 1, y: 9, z: 3 }, b: 1 });

    const cleared = deepMerge(
      {
        subtitleSettings: {
          knobOverrides: { register: 'casual', brevity: 'terse' },
          enabled: true,
        },
      } as Record<string, unknown>,
      {
        subtitleSettings: {
          knobOverrides: {},
          enabled: true,
        },
      },
    );
    expect(
      (cleared.subtitleSettings as { knobOverrides: Record<string, unknown> }).knobOverrides,
    ).toEqual({});

    expect(
      deepMerge({ list: [1, 2] } as Record<string, unknown>, { list: [3] }).list,
    ).toEqual([3]);
  });
});

/**
 * Tests: full-settings backup encryption + import sanitizer.
 * Runs in the node env (default for lib/**); crypto.subtle is Node's global
 * webcrypto — no chrome mock required.
 */

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
  it('round-trips full settings and rejects wrong credentials, tampering, unknown versions, and short passwords', async () => {
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
    await expect(decryptBackup(envelope, 'wrong-password-123')).rejects.toThrow(
      BackupDecryptError,
    );

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
    await expect(encryptBackup(fullSettings(), 'short')).rejects.toThrow(
      /at least 8 characters/,
    );
  });
});

describe('detectFormat / sanitizeImportObject / serializeSettings', () => {
  it('detects envelopes, splits import keys safely, and emits pretty JSON containing every key', () => {
    // facet: detectFormat detects the encrypted envelope and treats plain settings,
    // foreign formats, and non-JSON as plain.
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

    // facet: sanitizeImportObject splits recognized vs ignored keys, drops
    // prototype-pollution keys, and rejects non-object payloads.
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

    // Non-object payloads are rejected…
    expect(() => sanitizeImportObject(null)).toThrow(/JSON object/);
    expect(() => sanitizeImportObject([1, 2])).toThrow(/JSON object/);
    expect(() => sanitizeImportObject('string')).toThrow(/JSON object/);

    // …and a full settings object passes through untouched.
    const { recognized: fullRec, ignored: fullIgn } = sanitizeImportObject(fullSettings());
    expect(fullIgn).toEqual([]);
    expect(fullRec['providers']).toEqual(fullSettings().providers);

    // facet: serializeSettings emits pretty JSON containing every key.
    const text = serializeSettings(fullSettings());
    const serialized = JSON.parse(text) as Record<string, unknown>;
    expect(serialized['providers']).toBeTruthy();
    expect(serialized['pdfSettings']).toBeTruthy();
    expect(serialized['scientificPdf']).toBeTruthy();
    expect(text).toContain('\n  ');
  });
});

describe('deepEqual', () => {
  it('compares scalars/arrays and nested plain objects (no inherited properties)', () => {
    // Scalars with Object.is semantics.
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(0, -0)).toBe(false);
    expect(deepEqual(NaN, NaN)).toBe(true);

    // Arrays element-wise, order-sensitive.
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual([{ a: 1 }], [{ a: 1 }])).toBe(true);

    // Nested plain objects by own keys.
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);

    // Inherited properties are never compared.
    const o = Object.create({ inherited: 1 }) as Record<string, unknown>;
    o.own = 1;
    expect(deepEqual(o, { own: 1 })).toBe(true);
  });
});

describe('computeImportImpact / pickKnownSettings', () => {
  const customized = (): ExtensionSettings => ({
    ...DEFAULT_SETTINGS,
    targetLanguage: 'ja',
    theme: 'bubble',
    // Untouched built-in site rules — how a real loaded store looks.
    siteRules: BUILT_IN_RULES.map((r) => ({ ...r })),
  });

  it('computes merge/replace impacts and picks every DEFAULT_SETTINGS key while excluding store internals', () => {
    // facet: computeImportImpact computes merge changes and replace resets
    // without warning for built-in rules.
    const mergeImpact = computeImportImpact(customized(), { targetLanguage: 'ko' }, 'merge');
    expect(mergeImpact.changed).toEqual(['targetLanguage']);
    expect(mergeImpact.resetToDefaults).toEqual([]);

    const same = computeImportImpact(customized(), { targetLanguage: 'ja' }, 'merge');
    expect(same.changed).toEqual([]);

    // A partial nested object that changes a nested field is listed as changed.
    const mergeCurrent = customized();
    mergeCurrent.pdfSettings = { ...DEFAULT_SETTINGS.pdfSettings, openMode: 'same-tab' };
    const nested = computeImportImpact(mergeCurrent, { pdfSettings: { autoOpen: 'prompt' } }, 'merge');
    expect(nested.changed).toEqual(['pdfSettings']);

    // undefined file values are no-ops.
    const noop = computeImportImpact(mergeCurrent, { targetLanguage: undefined }, 'merge');
    expect(noop.changed).toEqual([]);

    const impact = computeImportImpact(customized(), { targetLanguage: 'ko' }, 'replace');
    expect(impact.changed).toEqual(['targetLanguage']);
    expect(impact.resetToDefaults).toContain('theme');
    expect(impact.resetToDefaults).not.toContain('targetLanguage');

    const current = customized();
    expect(
      computeImportImpact(current, { targetLanguage: 'ko' }, 'replace').resetToDefaults,
    ).not.toContain('siteRules');

    // Empty file: merge is a no-op; replace warns every customized key.
    expect(computeImportImpact(current, {}, 'merge')).toEqual({
      changed: [],
      resetToDefaults: [],
    });
    const replace = computeImportImpact(current, {}, 'replace');
    expect(replace.changed).toEqual([]);
    expect(replace.resetToDefaults).toContain('theme');
    expect(replace.resetToDefaults).toContain('targetLanguage');

    // Nothing customized -> no warnings.
    const untouched = { ...DEFAULT_SETTINGS, siteRules: BUILT_IN_RULES.map((r) => ({ ...r })) };
    expect(computeImportImpact(untouched, {}, 'replace').resetToDefaults).toEqual([]);

    // facet: pickKnownSettings picks every DEFAULT_SETTINGS key, excludes store
    // internals, and falls back to DEFAULT_SETTINGS for missing keys.
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
