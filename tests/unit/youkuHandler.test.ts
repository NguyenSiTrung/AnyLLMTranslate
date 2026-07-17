/**
 * YoukuHandler — ASS-only URL intercept (Immersive parity) + DOM/manifest fallbacks.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { YoukuHandler, youkuCodeToLanguage } from '@/inject/subtitleHandlers/youku';

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

  it('maps codes, detects hosts, and requires /v_show/id_ for watch page', () => {
    expect(youkuCodeToLanguage('default')).toBe('zh-Hans');
    expect(youkuCodeToLanguage('chs')).toBe('zh-Hans');
    expect(youkuCodeToLanguage('cht')).toBe('zh-Hant');
    expect(youkuCodeToLanguage('kr')).toBe('ko');
    expect(youkuCodeToLanguage('po')).toBe('pt');
    expect(youkuCodeToLanguage('en')).toBe('en');

    expect(handler.detect()).toBe(true);
    Object.defineProperty(window, 'location', {
      value: { hostname: 'v.youku.com', pathname: '/', href: 'https://v.youku.com/' },
      writable: true,
      configurable: true,
    });
    expect(handler.detect()).toBe(true);

    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'www.youku.tv',
        pathname: '/v/v_show/id_XNjUxNTI4OTk3Mg==.html',
        href: 'https://www.youku.tv/v/v_show/id_XNjUxNTI4OTk3Mg==.html',
      },
      writable: true,
      configurable: true,
    });
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

  it('ASS-only URL patterns, language extraction, and HLS manifest match', () => {
    const patterns = handler.getPatterns();
    expect(patterns).toHaveLength(1);
    const { pattern } = patterns[0];

    expect(pattern.test('https://sub.ykimg.com/subtitle/en.ass')).toBe(true);
    expect(pattern.test('https://cdn.example.com/track_chs.ass?token=1')).toBe(true);

    // Progressive HLS leaf segments must NOT create per-URL sessions
    expect(pattern.test('https://pl-ali.youku.tv/segment001.vtt')).toBe(false);
    expect(pattern.test('https://cdn.example.com/sub.srt')).toBe(false);
    expect(pattern.test('https://cdn.example.com/sub.vtt')).toBe(false);

    const extractor = handler.getPatterns()[0].languageExtractor!;
    expect(extractor(new URL('https://cdn.example.com/a.ass?lang=en'))).toBe('en');
    expect(extractor(new URL('https://cdn.example.com/show_chs.ass'))).toBe('zh-Hans');
    expect(extractor(new URL('https://cdn.example.com/show_cht.ass'))).toBe('zh-Hant');

    const manifestPatterns = handler.getManifestPatterns!();
    const anyMatch = (url: string) => manifestPatterns.some((p) => p.pattern.test(url));
    expect(anyMatch('https://pl-ali.youku.tv/playlist/m3u8?vid=Xabc')).toBe(true);
    expect(anyMatch('https://cdn.example.com/master.m3u8')).toBe(true);
  });

  it('parses ASS/VTT and exposes DOM cue source with visibility hide', () => {
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

    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Hello Youku`;
    const vttCues = handler.transformResponse(vtt, 'text/vtt', 'https://cdn/x.vtt');
    expect(vttCues).toHaveLength(1);
    expect(vttCues[0].text).toBe('Hello Youku');

    const src = handler.getDomCueSource!();
    expect(src.cueSelector).toBe('#subtitle');
    expect(src.captionWindowSelector).toBe('#subtitle');
    expect(src.captionHideMethod).toBe('visibility');
    expect(src.observeRootSelector).toBe('#ykPlayer');
  });
});
