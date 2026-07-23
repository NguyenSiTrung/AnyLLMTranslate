import { describe, it, expect } from 'vitest';
import {
  applyPageScopePreset,
  detectPageScopePreset,
  PAGE_SCOPE_PRESET_OPTIONS,
} from '@/lib/pageScopePreset';
import { DEFAULT_SETTINGS } from '@/types/config';
import { deepMerge } from '@/lib/utils';

describe('pageScopePreset', () => {
  it('applies classic / balanced / main-content / full-page presets', () => {
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
  });

  it('detects named presets, custom mix, and DEFAULT_SETTINGS as balanced', () => {
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

  it('deepMerge fills missing flags but preserves explicit Classic overrides', () => {
    const merged = deepMerge(
      DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      { targetLanguage: 'en' } as Record<string, unknown>,
    ) as unknown as typeof DEFAULT_SETTINGS;
    expect(merged.enableStreamingTranslation).toBe(true);
    expect(merged.enableAsideCaps).toBe(true);
    expect(merged.targetLanguage).toBe('en');

    const classic = deepMerge(
      DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      {
        enableStreamingTranslation: false,
        enableAsideCaps: false,
      } as Record<string, unknown>,
    ) as unknown as typeof DEFAULT_SETTINGS;
    expect(classic.enableStreamingTranslation).toBe(false);
    expect(classic.enableAsideCaps).toBe(false);
  });
});
