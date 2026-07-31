import { describe, it, expect } from 'vitest';
import {
  applyPageScopePreset,
  detectPageScopePreset,
  PAGE_SCOPE_PRESET_OPTIONS,
} from '@/lib/pageScopePreset';
import { DEFAULT_SETTINGS } from '@/types/config';

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
