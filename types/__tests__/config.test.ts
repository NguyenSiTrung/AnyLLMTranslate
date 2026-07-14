/**
 * Critical default regressions only (not interface shape checks — TypeScript covers those).
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEFAULT_SUBTITLE_SETTINGS,
  DEFAULT_PDF_SETTINGS,
  DEFAULT_YOUTUBE_ASR_RESEGMENT_SETTINGS,
  DEFAULT_KEY_MAX_RPM,
  DEFAULT_KEY_CONCURRENCY_LIMIT,
  DEFAULT_KEY_INTERVAL_MS,
  defaultPoolKeyThrottle,
  PROVIDER_PRESETS,
} from '@/types/config';

describe('config defaults', () => {
  it('ships language/display defaults, feature flags OFF, and nested subtitle/PDF baselines', () => {
    expect(DEFAULT_SETTINGS.sourceLanguage).toBe('auto');
    expect(DEFAULT_SETTINGS.targetLanguage).toBe('vi');
    expect(DEFAULT_SETTINGS.displayMode).toBe('bilingual-below');
    expect(DEFAULT_SETTINGS.theme).toBe('blockquote');
    expect(DEFAULT_SETTINGS.provider.preset).toBe('custom');
    expect(DEFAULT_SETTINGS.enableCompactInlineForShortText).toBe(false);
    expect(DEFAULT_SETTINGS.enableBodyTagWhitelist).toBe(false);
    // Balanced defaults (web-translate-v3): streaming + aside caps ON
    expect(DEFAULT_SETTINGS.enableStreamingTranslation).toBe(true);
    expect(DEFAULT_SETTINGS.enableAsideCaps).toBe(true);

    expect(DEFAULT_SETTINGS.subtitleSettings).toEqual(DEFAULT_SUBTITLE_SETTINGS);
    expect(DEFAULT_SUBTITLE_SETTINGS.enabled).toBe(true);
    expect(DEFAULT_SUBTITLE_SETTINGS.position).toBe('bottom');
    expect(DEFAULT_SETTINGS.pdfSettings).toEqual(DEFAULT_PDF_SETTINGS);
    expect(DEFAULT_PDF_SETTINGS.autoOpen).toBe('off');

    expect(DEFAULT_YOUTUBE_ASR_RESEGMENT_SETTINGS).toEqual({ enable: true, aiEnable: false });
    expect(DEFAULT_SUBTITLE_SETTINGS.youtubeAsrResegment).toEqual(
      DEFAULT_YOUTUBE_ASR_RESEGMENT_SETTINGS,
    );
  });

  it('exposes a single custom preset and untasted default pool key', () => {
    expect(PROVIDER_PRESETS).toHaveLength(1);
    expect(PROVIDER_PRESETS[0]!.preset).toBe('custom');
    expect(PROVIDER_PRESETS[0]!.requiresApiKey).toBe(false);
    const defaultKey = DEFAULT_SETTINGS.providers[0]?.keys[0];
    expect(defaultKey).toBeDefined();
    expect(defaultKey?.lastTestResult).toBeUndefined();
  });

  it('uses safe throttle defaults for new pool keys (not unlimited 0)', () => {
    expect(DEFAULT_KEY_MAX_RPM).toBe(20);
    expect(DEFAULT_KEY_CONCURRENCY_LIMIT).toBe(1);
    expect(DEFAULT_KEY_INTERVAL_MS).toBe(500);
    expect(defaultPoolKeyThrottle()).toEqual({
      maxRpm: 20,
      concurrencyLimit: 1,
      interval: 500,
    });

    expect(DEFAULT_SETTINGS.maxRpm).toBe(DEFAULT_KEY_MAX_RPM);
    expect(DEFAULT_SETTINGS.provider.maxRpm).toBe(DEFAULT_KEY_MAX_RPM);

    const defaultKey = DEFAULT_SETTINGS.providers[0]?.keys[0];
    expect(defaultKey?.maxRpm).toBe(DEFAULT_KEY_MAX_RPM);
    expect(defaultKey?.concurrencyLimit).toBe(DEFAULT_KEY_CONCURRENCY_LIMIT);
    expect(defaultKey?.interval).toBe(DEFAULT_KEY_INTERVAL_MS);
  });
});
