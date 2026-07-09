/**
 * YoukuHandler — ASS-only URL intercept (Immersive parity) + DOM/manifest fallbacks.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { YoukuHandler, youkuCodeToLanguage } from '@/inject/subtitleHandlers/youku';

describe('youkuCodeToLanguage', () => {
  it('maps Youku picker codes to BCP-47', () => {
    expect(youkuCodeToLanguage('default')).toBe('zh-Hans');
    expect(youkuCodeToLanguage('chs')).toBe('zh-Hans');
    expect(youkuCodeToLanguage('cht')).toBe('zh-Hant');
    expect(youkuCodeToLanguage('kr')).toBe('ko');
    expect(youkuCodeToLanguage('po')).toBe('pt');
    expect(youkuCodeToLanguage('en')).toBe('en');
  });
});

describe('YoukuHandler', () => {
  const handler = new YoukuHandler();
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'www.youku.tv',
        pathname: '/v/v_show/id_XNjUxNTI4OTk3Mg==.html',
        href: 'https://www.youku.tv/v/v_show/id_XNjUxNTI4OTk3Mg==.html',
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

  it('detects youku hosts', () => {
    expect(handler.detect()).toBe(true);
    Object.defineProperty(window, 'location', {
      value: { hostname: 'v.youku.com', pathname: '/', href: 'https://v.youku.com/' },
      writable: true,
      configurable: true,
    });
    expect(handler.detect()).toBe(true);
  });

  it('isWatchPage requires /v_show/id_', () => {
    expect(handler.isWatchPage()).toBe(true);
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'www.youku.tv',
        pathname: '/channel/tv',
        href: 'https://www.youku.tv/channel/tv',
      },
      writable: true,
      configurable: true,
    });
    expect(handler.isWatchPage()).toBe(false);
  });

  describe('getPatterns', () => {
    it('matches only .ass URLs (not progressive .vtt segments)', () => {
      const patterns = handler.getPatterns();
      expect(patterns).toHaveLength(1);
      const { pattern } = patterns[0];

      expect(pattern.test('https://sub.ykimg.com/subtitle/en.ass')).toBe(true);
      expect(pattern.test('https://cdn.example.com/track_chs.ass?token=1')).toBe(true);

      // Progressive HLS leaf segments must NOT create per-URL sessions
      expect(pattern.test('https://pl-ali.youku.tv/segment001.vtt')).toBe(false);
      expect(pattern.test('https://cdn.example.com/sub.srt')).toBe(false);
      expect(pattern.test('https://cdn.example.com/sub.vtt')).toBe(false);
    });

    it('extracts language from query or filename', () => {
      const extractor = handler.getPatterns()[0].languageExtractor!;
      expect(extractor(new URL('https://cdn.example.com/a.ass?lang=en'))).toBe('en');
      expect(extractor(new URL('https://cdn.example.com/show_chs.ass'))).toBe('zh-Hans');
      expect(extractor(new URL('https://cdn.example.com/show_cht.ass'))).toBe('zh-Hant');
    });
  });

  describe('getManifestPatterns', () => {
    it('matches Youku HLS playlist URLs', () => {
      const patterns = handler.getManifestPatterns!();
      const anyMatch = (url: string) => patterns.some((p) => p.pattern.test(url));
      expect(anyMatch('https://pl-ali.youku.tv/playlist/m3u8?vid=Xabc')).toBe(true);
      expect(anyMatch('https://cdn.example.com/master.m3u8')).toBe(true);
    });
  });

  describe('transformResponse', () => {
    it('parses ASS Dialogue lines', () => {
      const ass = `[Script Info]
Title: t

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,First line
Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,Second`;
      const cues = handler.transformResponse(ass, 'text/plain', 'https://cdn/x.ass');
      expect(cues).toHaveLength(2);
      expect(cues[0].text).toBe('First line');
      expect(cues[0].startTime).toBe(1);
    });

    it('parses WebVTT when served (manifest path / older content)', () => {
      const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Hello Youku`;
      const cues = handler.transformResponse(vtt, 'text/vtt', 'https://cdn/x.vtt');
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Hello Youku');
    });
  });

  describe('getDomCueSource', () => {
    it('uses visibility hide on #subtitle (cue source is hide target)', () => {
      const src = handler.getDomCueSource!();
      expect(src.cueSelector).toBe('#subtitle');
      expect(src.captionWindowSelector).toBe('#subtitle');
      expect(src.captionHideMethod).toBe('visibility');
      expect(src.observeRootSelector).toBe('#ykPlayer');
    });
  });
});
