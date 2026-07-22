import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_INLINE_TRANSLATE_SETTINGS,
  DEFAULT_SETTINGS,
  type InlineTranslateSettings,
} from '@/types/config';
import { deepMerge } from '@/lib/utils';
import { loadSettings } from '@/lib/config';
import { parseLanguagePrefix, LANGUAGE_PREFIX_ALIASES } from '@/lib/inlineTranslatePrefix';
import {
  INLINE_PREVIEW_SOURCE,
  resolvePreviewTranslation,
  buildPreviewProjection,
} from '@/lib/inlineTranslatePreview';

describe('InlineTranslate settings, prefix & preview helpers', () => {
  it('defaults, deep-merge partial storage, and loadSettings fill missing nested fields', async () => {
    const d = DEFAULT_INLINE_TRANSLATE_SETTINGS;
    expect(d).toMatchObject({
      enabled: true,
      triggerKey: ' ',
      tapCount: 3,
      timeWindowMs: 500,
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
  });

  it('parses language prefixes, resolves preview samples, and builds projections', () => {
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
