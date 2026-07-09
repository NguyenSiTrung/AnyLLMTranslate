/**
 * Critical default regressions only (not interface shape checks — TypeScript covers those).
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEFAULT_SUBTITLE_SETTINGS,
  DEFAULT_PDF_SETTINGS,
  PROVIDER_PRESETS,
} from '@/types/config';

describe('config defaults', () => {
  it('ships critical language/display defaults', () => {
    expect(DEFAULT_SETTINGS.sourceLanguage).toBe('auto');
    expect(DEFAULT_SETTINGS.targetLanguage).toBe('vi');
    expect(DEFAULT_SETTINGS.displayMode).toBe('bilingual-below');
    expect(DEFAULT_SETTINGS.theme).toBe('blockquote');
    expect(DEFAULT_SETTINGS.provider.preset).toBe('custom');
  });

  it('defaults feature flags that change page-walk behaviour to OFF', () => {
    expect(DEFAULT_SETTINGS.enableCompactInlineForShortText).toBe(false);
    expect(DEFAULT_SETTINGS.enableBodyTagWhitelist).toBe(false);
    expect(DEFAULT_SETTINGS.enableAsideCaps).toBe(false);
  });

  it('embeds subtitle and PDF defaults with safe baselines', () => {
    expect(DEFAULT_SETTINGS.subtitleSettings).toEqual(DEFAULT_SUBTITLE_SETTINGS);
    expect(DEFAULT_SUBTITLE_SETTINGS.enabled).toBe(true);
    expect(DEFAULT_SUBTITLE_SETTINGS.position).toBe('bottom');
    expect(DEFAULT_SETTINGS.pdfSettings).toEqual(DEFAULT_PDF_SETTINGS);
    expect(DEFAULT_PDF_SETTINGS.autoOpen).toBe('off');
  });

  it('exposes a single custom provider preset', () => {
    expect(PROVIDER_PRESETS).toHaveLength(1);
    expect(PROVIDER_PRESETS[0].preset).toBe('custom');
    expect(PROVIDER_PRESETS[0].requiresApiKey).toBe(false);
  });

  it('default pool key has no lastTestResult', () => {
    const defaultKey = DEFAULT_SETTINGS.providers[0]?.keys[0];
    expect(defaultKey).toBeDefined();
    expect(defaultKey?.lastTestResult).toBeUndefined();
  });
});
