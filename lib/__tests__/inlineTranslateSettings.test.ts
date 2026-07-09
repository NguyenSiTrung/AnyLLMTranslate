import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_INLINE_TRANSLATE_SETTINGS,
  DEFAULT_SETTINGS,
  type InlineTranslateSettings,
} from '@/types/config';
import { deepMerge } from '@/lib/utils';
import { loadSettings } from '@/lib/config';

describe('InlineTranslateSettings defaults & deep-merge', () => {
  it('DEFAULT_INLINE_TRANSLATE_SETTINGS includes Immersive-parity fields', () => {
    const d = DEFAULT_INLINE_TRANSLATE_SETTINGS;
    expect(d.enabled).toBe(true);
    expect(d.triggerKey).toBe(' ');
    expect(d.tapCount).toBe(3);
    expect(d.timeWindowMs).toBe(500);
    expect(d.idleMs).toBe(0);
    expect(d.triggerGapMs).toBe(0);
    expect(d.triggerToleranceCount).toBe(0);
    expect(d.enableLanguagePrefix).toBe(true);
    expect(d.languagePrefix).toBe('/');
    expect(d.dualMode).toBe(false);
    expect(d.enableFallbackUndo).toBe(true);
    expect(d.blocklistPatterns.length).toBeGreaterThan(0);
  });

  it('deep-merges partial stored inlineTranslate onto defaults', () => {
    const stored = {
      inlineTranslate: {
        enabled: false,
        tapCount: 4,
        // missing idleMs, dualMode, blocklistPatterns, etc.
      },
    };
    const merged = deepMerge(
      DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      stored as Record<string, unknown>,
    ) as { inlineTranslate: InlineTranslateSettings };

    expect(merged.inlineTranslate.enabled).toBe(false);
    expect(merged.inlineTranslate.tapCount).toBe(4);
    expect(merged.inlineTranslate.idleMs).toBe(DEFAULT_INLINE_TRANSLATE_SETTINGS.idleMs);
    expect(merged.inlineTranslate.dualMode).toBe(false);
    expect(merged.inlineTranslate.enableLanguagePrefix).toBe(true);
    expect(merged.inlineTranslate.blocklistPatterns).toEqual(
      DEFAULT_INLINE_TRANSLATE_SETTINGS.blocklistPatterns,
    );
    expect(merged.inlineTranslate.targetLanguage).toBe('en');
  });

  it('loadSettings fills missing nested inlineTranslate fields from defaults', async () => {
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
    expect(settings.inlineTranslate.blocklistPatterns.length).toBeGreaterThan(0);
  });
});
