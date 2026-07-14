import { describe, it, expect } from 'vitest';
import {
  applyPageScopePreset,
  detectPageScopePreset,
  PAGE_SCOPE_PRESET_OPTIONS,
} from '@/lib/pageScopePreset';
import { DEFAULT_SETTINGS } from '@/types/config';
import { deepMerge } from '@/lib/utils';

describe('applyPageScopePreset', () => {
  it('Classic restores pre-v3 streaming/aside/walk defaults', () => {
    expect(applyPageScopePreset('classic')).toEqual({
      enableStreamingTranslation: false,
      enableAsideCaps: false,
      enableBodyTagWhitelist: false,
      enableSmartExcludes: true,
    });
  });

  it('Balanced matches product defaults after v3', () => {
    const balanced = applyPageScopePreset('balanced');
    expect(balanced).toEqual({
      enableStreamingTranslation: true,
      enableAsideCaps: true,
      enableBodyTagWhitelist: false,
      enableSmartExcludes: true,
    });
    // DEFAULT_SETTINGS should be Balanced for new installs.
    expect(DEFAULT_SETTINGS.enableStreamingTranslation).toBe(balanced.enableStreamingTranslation);
    expect(DEFAULT_SETTINGS.enableAsideCaps).toBe(balanced.enableAsideCaps);
    expect(DEFAULT_SETTINGS.enableBodyTagWhitelist).toBe(balanced.enableBodyTagWhitelist);
    expect(DEFAULT_SETTINGS.enableSmartExcludes).toBe(balanced.enableSmartExcludes);
  });

  it('Main content enables body whitelist + aside caps', () => {
    expect(applyPageScopePreset('main-content')).toMatchObject({
      enableBodyTagWhitelist: true,
      enableAsideCaps: true,
      enableSmartExcludes: true,
      enableStreamingTranslation: true,
    });
  });

  it('Full page disables caps, whitelist, and smart excludes', () => {
    expect(applyPageScopePreset('full-page')).toEqual({
      enableStreamingTranslation: true,
      enableAsideCaps: false,
      enableBodyTagWhitelist: false,
      enableSmartExcludes: false,
    });
  });
});

describe('detectPageScopePreset', () => {
  it('detects each named preset round-trip', () => {
    for (const { value } of PAGE_SCOPE_PRESET_OPTIONS) {
      expect(detectPageScopePreset(applyPageScopePreset(value))).toBe(value);
    }
  });

  it('returns custom when knobs are mixed', () => {
    expect(
      detectPageScopePreset({
        enableStreamingTranslation: true,
        enableAsideCaps: false,
        enableBodyTagWhitelist: true,
        enableSmartExcludes: true,
      }),
    ).toBe('custom');
  });

  it('detects Balanced on DEFAULT_SETTINGS', () => {
    expect(detectPageScopePreset(DEFAULT_SETTINGS)).toBe('balanced');
  });
});

describe('migration-safe defaults (deepMerge)', () => {
  it('fills missing streaming/aside flags from new defaults for legacy stores', () => {
    // User had an old install without these keys — deepMerge(DEFAULT, stored) should
    // adopt Balanced defaults when fields were never persisted.
    const legacyPartial = {
      targetLanguage: 'en',
      // intentionally omit enableStreamingTranslation / enableAsideCaps
    };
    const merged = deepMerge(
      DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      legacyPartial as Record<string, unknown>,
    ) as typeof DEFAULT_SETTINGS;

    expect(merged.enableStreamingTranslation).toBe(true);
    expect(merged.enableAsideCaps).toBe(true);
    expect(merged.targetLanguage).toBe('en');
  });

  it('preserves explicit Classic-style user overrides', () => {
    const stored = {
      enableStreamingTranslation: false,
      enableAsideCaps: false,
    };
    const merged = deepMerge(
      DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      stored as Record<string, unknown>,
    ) as typeof DEFAULT_SETTINGS;

    expect(merged.enableStreamingTranslation).toBe(false);
    expect(merged.enableAsideCaps).toBe(false);
  });
});
