import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_INLINE_TRANSLATE_SETTINGS,
  DEFAULT_SETTINGS,
  type InlineTranslateSettings,
} from '@/types/config';
import { deepMerge } from '@/lib/utils';
import { loadSettings } from '@/lib/config';

describe('InlineTranslateSettings defaults & deep-merge', () => {
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
});
