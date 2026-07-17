/**
 * Tests for GenericSubtitleHandler — URL patterns, content validation,
 * DOM cue source, native caption hide, handler priority (specific > generic),
 * and settings toggle behavior.
 *
 * The registry's `handlers` array is module-level state, so the detect() /
 * precedence tests use `vi.resetModules()` + dynamic import per case to start
 * from a clean registry (mirroring the coordinator test pattern).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SubtitleHandler } from '@/inject/subtitleHandlers/registry';
import { GenericSubtitleHandler } from '@/inject/subtitleHandlers/generic';

// ---------------------------------------------------------------------------
// Helpers — register a set of mock handlers with controlled detect() results.
// ---------------------------------------------------------------------------

interface MockHandlerOpts {
  platform: string;
  detects: boolean;
  patterns?: RegExp[];
}

function makeMockHandler({ platform, detects, patterns = [] }: MockHandlerOpts): SubtitleHandler {
  return {
    platform,
    detect: () => detects,
    getPatterns: () =>
      patterns.map((p) => ({ platform, pattern: p })),
    transformResponse: () => [],
  };
}

// ---------------------------------------------------------------------------
// Phase 1 + 3: pure-behaviour tests (no registry coupling for most).
// ---------------------------------------------------------------------------

describe('GenericSubtitleHandler — static behaviour', () => {
  let handler: GenericSubtitleHandler;

  beforeEach(() => {
    handler = new GenericSubtitleHandler();
  });

  it('URL patterns match subtitle shapes, reject non-subtitles, extract language', () => {
    const pattern = () => handler.getPatterns();
    const matchUrls = [
      'https://cdn.example.com/subs/movie_en.vtt',
      'https://cdn.example.com/subs/movie_en.webvtt',
      'https://cdn.example.com/subs/movie.vtt?token=abc',
      'https://cdn.example.com/subs/movie.vtt#frag',
      'https://cdn.example.com/subs/movie.srt',
      'https://cdn.example.com/subs/movie.srt?lang=fr',
      'https://cdn.example.com/subs/movie.ttml',
      'https://cdn.example.com/subs/movie.ttml2',
      'https://cdn.example.com/subs/movie.dfxp',
      'https://cdn.example.com/subtitle/en/001',
      'https://cdn.example.com/captions/en/main',
      'https://cdn.example.com/texttrack/primary',
      'https://cdn.example.com/subtitles/segment-1.vtt',
    ];
    for (const url of matchUrls) {
      const matched = pattern().some((p) => p.pattern.test(url));
      expect(matched, `expected patterns to match ${url}`).toBe(true);
    }

    const rejectUrls = [
      'https://cdn.example.com/manifest.m3u8',
      'https://cdn.example.com/video/main.mp4',
      'https://cdn.example.com/api/metadata.json',
      'https://cdn.example.com/chapters/en.xml',
      'https://cdn.example.com/app/manifest.webmanifest',
      'https://cdn.example.com/srtthing.png',
      'https://cdn.example.com/movie.vttx',
    ];
    for (const url of rejectUrls) {
      const matched = pattern().some((p) => p.pattern.test(url));
      expect(matched, `expected patterns to NOT match ${url}`).toBe(false);
    }

    const vttPattern = handler.getPatterns()[0]; // .vtt pattern
    const extractor = vttPattern.languageExtractor;
    expect(extractor).toBeDefined();
    if (!extractor) return;
    expect(extractor(new URL('https://x/sub.vtt?lang=en-US'))).toBe('en-us');
    expect(extractor(new URL('https://x/sub.vtt?language=fr'))).toBe('fr');
    expect(extractor(new URL('https://x/sub.vtt?locale=ja_JP'))).toBe('ja-jp');
    expect(extractor(new URL('https://x/movie_en.vtt'))).toBe('en');
    expect(extractor(new URL('https://x/movie.fr.srt'))).toBe('fr');
    // BCP-47 script subtag preserves case (zh-Hans is canonical, zh-hans is not).
    expect(extractor(new URL('https://x/subtitle_zh-Hans.vtt'))).toBe('zh-Hans');
    expect(extractor(new URL('https://x/sub.vtt'))).toBe('');
  });

  it('transformResponse, extractAvailableTracks, caption-hide/DOM/content-types', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hello world`;
    expect(handler.transformResponse(vtt, 'text/vtt', 'https://x/a.vtt')).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: 'Hello world' })]),
    );

    const srt = `1
00:00:01,000 --> 00:00:02,000
Bonjour`;
    expect(handler.transformResponse(srt, 'application/octet-stream', 'https://x/a.srt')).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: 'Bonjour' })]),
    );

    const ttml = `<?xml version="1.0"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body><div><p begin="1s" end="2s">Hi</p></div></body>
</tt>`;
    expect(
      handler.transformResponse(ttml, 'application/ttml+xml', 'https://x/a.ttml').length,
    ).toBeGreaterThanOrEqual(1);

    expect(
      handler.transformResponse('Some random text\nwithout timing lines', 'text/plain', 'https://x/a.vtt'),
    ).toEqual([]);
    expect(handler.transformResponse('', 'text/vtt', 'https://x/a.vtt')).toEqual([]);
    expect(handler.transformResponse('{"a":1}', 'application/json', 'https://x/a.vtt')).toEqual([]);
    expect(
      handler.transformResponse('<config><key>val</key></config>', 'application/xml', 'https://x/a.xml'),
    ).toEqual([]);

    const chapters = `WEBVTT

CHAPTER
00:00:00.000 --> 00:01:00.000
Intro`;
    expect(
      handler.transformResponse(chapters, 'text/vtt', 'https://x/a.vtt').length,
    ).toBeGreaterThanOrEqual(1);

    const withLang = handler.extractAvailableTracks('', '', 'https://x/sub_en.vtt');
    expect(withLang).toHaveLength(1);
    expect(withLang[0]).toMatchObject({ platform: 'generic', url: 'https://x/sub_en.vtt', language: 'en' });

    const noLang = handler.extractAvailableTracks('', '', 'https://x/subtitle/segment-1');
    expect(noLang).toHaveLength(1);
    expect(noLang[0].language).toBe('');

    const hide = handler.getNativeCaptionHide();
    expect(hide.method).toBe('display');
    expect(hide.selector).toContain('.vjs-text-track-display');
    expect(hide.selector).toContain('.shaka-text-container');
    expect(hide.selector).toContain('[data-testid*="caption"]');

    const src = handler.getDomCueSource();
    expect(src.cueSelector).toContain('.vjs-text-track-display');
    expect(src.captionWindowSelector).toBeTruthy();
    expect(src.observeRootSelector).toBe('body');
    expect(src.captionHideMethod).toBe('display');
    expect(src.readActiveLanguage()).toBe('');
    expect(src.trackSwitchSelector).toBeUndefined();

    const cts = handler.getContentTypePatterns();
    expect(cts).toEqual(expect.arrayContaining(['text/vtt', 'application/x-subtitle', 'application/ttml+xml']));
  });
});

// ---------------------------------------------------------------------------
// Phase 4 + 5: detect() priority and settings toggle.
// ---------------------------------------------------------------------------

describe('GenericSubtitleHandler — detect() priority and settings', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function importFresh() {
    vi.resetModules();
    const mod = await import('@/inject/subtitleHandlers/registry');
    const genericMod = await import('@/inject/subtitleHandlers/generic');
    return { ...mod, GenericSubtitleHandler: genericMod.GenericSubtitleHandler };
  }

  it('yields to specific handlers, falls back to generic; default toggle true', async () => {
    {
      const { registerSubtitleHandlers, GenericSubtitleHandler } = await importFresh();
      const generic = new GenericSubtitleHandler();
      registerSubtitleHandlers([generic]);
      expect(generic.detect()).toBe(true);
    }
    {
      const { registerSubtitleHandlers, GenericSubtitleHandler, detectCurrentHandler, getPatternsForCurrentHost } =
        await importFresh();
      const specific = makeMockHandler({
        platform: 'youtube',
        detects: true,
        patterns: [/youtube\.com\/timedtext/],
      });
      const generic = new GenericSubtitleHandler();
      registerSubtitleHandlers([specific, generic]);
      expect(generic.detect()).toBe(false);
      expect(detectCurrentHandler()?.platform).toBe('youtube');
      const platforms = getPatternsForCurrentHost().map((p) => p.platform);
      expect(platforms).not.toContain('generic');
      expect(platforms).toContain('youtube');
    }
    {
      const { registerSubtitleHandlers, GenericSubtitleHandler, detectCurrentHandler, getPatternsForCurrentHost } =
        await importFresh();
      const youtube = makeMockHandler({ platform: 'youtube', detects: false });
      const max = makeMockHandler({ platform: 'hbomax', detects: false });
      const generic = new GenericSubtitleHandler();
      registerSubtitleHandlers([youtube, max, generic]);
      expect(generic.detect()).toBe(true);
      expect(detectCurrentHandler()?.platform).toBe('generic');
      const platforms = getPatternsForCurrentHost().map((p) => p.platform);
      expect(platforms.every((p) => p === 'generic')).toBe(true);
      expect(platforms.length).toBeGreaterThan(0);
    }

    const { DEFAULT_SUBTITLE_SETTINGS } = await import('@/types/config');
    expect(DEFAULT_SUBTITLE_SETTINGS.enableGenericSubtitleHandler).toBe(true);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
