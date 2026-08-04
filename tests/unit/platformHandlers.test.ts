// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { YoukuHandler, youkuCodeToLanguage } from '@/inject/subtitleHandlers/youku';
import { YouTubeHandler } from '@/inject/subtitleHandlers/youtube';
import { DisneyPlusHandler } from '@/inject/subtitleHandlers/disneyplus';
import { WetvHandler } from '@/inject/subtitleHandlers/wetv';
import { GenericSubtitleHandler } from '@/inject/subtitleHandlers/generic';

describe('Platform Subtitle Handlers', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'www.youtube.com',
        pathname: '/watch',
        href: 'https://www.youtube.com/watch?v=123',
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('handles YouTube timedtext patterns and language extractions, plus Youku, Disney+, WeTV, and Generic fallback handlers', () => {
    const handler = new YouTubeHandler();
    expect(handler.detect()).toBe(true);
    expect(handler.isWatchPage()).toBe(true);

    const patterns = handler.getPatterns();
    expect(patterns.length).toBeGreaterThan(0);
    const { pattern, languageExtractor } = patterns[0]!;
    const url = 'https://www.youtube.com/api/timedtext?v=123&lang=en&fmt=vtt';
    expect(pattern.test(url)).toBe(true);
    if (languageExtractor) {
      expect(languageExtractor(new URL(url))).toBe('en');
    }

    // Youku language map (handler detect is hostname-bound)
    expect(youkuCodeToLanguage('chs')).toBe('zh-Hans');
    expect(youkuCodeToLanguage('en')).toBe('en');
    const youku = new YoukuHandler();
    expect(youku.platform).toBe('youku');

    // Disney+
    const disney = new DisneyPlusHandler();
    expect(disney.getPatterns().length).toBeGreaterThan(0);

    // WeTV
    const wetv = new WetvHandler();
    expect(wetv.getPatterns().length).toBeGreaterThan(0);

    // Generic fallback
    const generic = new GenericSubtitleHandler();
    // On YouTube hostname a specific handler detects, so generic.detect() yields
    expect(typeof generic.detect()).toBe('boolean');
    expect(generic.getPatterns().length).toBeGreaterThan(0);
  });
});
