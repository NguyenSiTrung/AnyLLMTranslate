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
// `transformResponse` / `getPatterns` / `getNativeCaptionHide` /
// `getDomCueSource` / `extractAvailableTracks` are stateless on a fresh
// instance, so they don't need module isolation.
// ---------------------------------------------------------------------------

describe('GenericSubtitleHandler — static behaviour', () => {
  let handler: GenericSubtitleHandler;

  beforeEach(() => {
    handler = new GenericSubtitleHandler();
  });

  describe('getPatterns — URL matching', () => {
    const pattern = () => handler.getPatterns();

    it.each([
      ['https://cdn.example.com/subs/movie_en.vtt'],
      ['https://cdn.example.com/subs/movie_en.webvtt'],
      ['https://cdn.example.com/subs/movie.vtt?token=abc'],
      ['https://cdn.example.com/subs/movie.vtt#frag'],
      ['https://cdn.example.com/subs/movie.srt'],
      ['https://cdn.example.com/subs/movie.srt?lang=fr'],
      ['https://cdn.example.com/subs/movie.ttml'],
      ['https://cdn.example.com/subs/movie.ttml2'],
      ['https://cdn.example.com/subs/movie.dfxp'],
      ['https://cdn.example.com/subtitle/en/001'],
      ['https://cdn.example.com/captions/en/main'],
      ['https://cdn.example.com/texttrack/primary'],
      ['https://cdn.example.com/subtitles/segment-1.vtt'],
    ])('matches subtitle URL %s', (url) => {
      const matched = pattern().some((p) => p.pattern.test(url));
      expect(matched, `expected patterns to match ${url}`).toBe(true);
    });

    it.each([
      ['https://cdn.example.com/manifest.m3u8'],
      ['https://cdn.example.com/video/main.mp4'],
      ['https://cdn.example.com/api/metadata.json'],
      ['https://cdn.example.com/chapters/en.xml'], // generic .xml NOT matched
      ['https://cdn.example.com/app/manifest.webmanifest'],
      ['https://cdn.example.com/srtthing.png'], // extension embedded in name, not at boundary
      ['https://cdn.example.com/movie.vttx'], // not a vtt boundary
    ])('does NOT match non-subtitle URL %s', (url) => {
      const matched = pattern().some((p) => p.pattern.test(url));
      expect(matched, `expected patterns to NOT match ${url}`).toBe(false);
    });

    it('languageExtractor derives code from query params and filename', () => {
      const vttPattern = handler.getPatterns()[0]; // .vtt pattern
      const extractor = vttPattern.languageExtractor;
      expect(extractor).toBeDefined();
      if (!extractor) return; // narrow for TS — asserted above at runtime
      expect(extractor(new URL('https://x/sub.vtt?lang=en-US'))).toBe('en-us');
      expect(extractor(new URL('https://x/sub.vtt?language=fr'))).toBe('fr');
      expect(extractor(new URL('https://x/sub.vtt?locale=ja_JP'))).toBe('ja-jp');
      expect(extractor(new URL('https://x/movie_en.vtt'))).toBe('en');
      expect(extractor(new URL('https://x/movie.fr.srt'))).toBe('fr');
      // BCP-47 script subtag preserves case (zh-Hans is canonical, zh-hans is not).
      expect(extractor(new URL('https://x/subtitle_zh-Hans.vtt'))).toBe('zh-Hans');
      expect(extractor(new URL('https://x/sub.vtt'))).toBe('');
    });
  });

  describe('transformResponse — content validation gate', () => {
    it('parses a valid WebVTT body', () => {
      const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hello world`;
      const cues = handler.transformResponse(vtt, 'text/vtt', 'https://x/a.vtt');
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Hello world');
    });

    it('parses a valid SRT body', () => {
      const srt = `1
00:00:01,000 --> 00:00:02,000
Bonjour`;
      const cues = handler.transformResponse(srt, 'application/octet-stream', 'https://x/a.srt');
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Bonjour');
    });

    it('parses a valid TTML body', () => {
      const ttml = `<?xml version="1.0"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body><div><p begin="1s" end="2s">Hi</p></div></body>
</tt>`;
      const cues = handler.transformResponse(ttml, 'application/ttml+xml', 'https://x/a.ttml');
      expect(cues.length).toBeGreaterThanOrEqual(1);
    });

    it('returns [] for a non-subtitle VTT-like payload', () => {
      // Random text without WEBVTT header or timing lines -> rejected.
      const fake = `Some random text\nwithout timing lines`;
      expect(handler.transformResponse(fake, 'text/plain', 'https://x/a.vtt')).toEqual([]);
    });

    it('accepts a chapter-marker VTT (canonical WEBVTT + timing — translating the title is harmless; over-rejecting risks dropping real cues)', () => {
      const chapters = `WEBVTT

CHAPTER
00:00:00.000 --> 00:01:00.000
Intro`;
      const cues = handler.transformResponse(chapters, 'text/vtt', 'https://x/a.vtt');
      expect(cues.length).toBeGreaterThanOrEqual(1);
    });

    it('returns [] for empty body', () => {
      expect(handler.transformResponse('', 'text/vtt', 'https://x/a.vtt')).toEqual([]);
    });

    it('returns [] for JSON / arbitrary XML', () => {
      expect(handler.transformResponse('{"a":1}', 'application/json', 'https://x/a.vtt')).toEqual([]);
      expect(
        handler.transformResponse('<config><key>val</key></config>', 'application/xml', 'https://x/a.xml'),
      ).toEqual([]);
    });
  });

  describe('extractAvailableTracks', () => {
    it('returns one track from an intercepted URL with extracted language', () => {
      const tracks = handler.extractAvailableTracks('', '', 'https://x/sub_en.vtt');
      expect(tracks).toHaveLength(1);
      expect(tracks[0].platform).toBe('generic');
      expect(tracks[0].url).toBe('https://x/sub_en.vtt');
      expect(tracks[0].language).toBe('en');
    });

    it('returns empty language when none derivable', () => {
      const tracks = handler.extractAvailableTracks('', '', 'https://x/subtitle/segment-1');
      expect(tracks).toHaveLength(1);
      expect(tracks[0].language).toBe('');
    });
  });

  describe('getNativeCaptionHide', () => {
    it('returns a selector union covering common frameworks', () => {
      const hide = handler.getNativeCaptionHide();
      expect(hide.method).toBe('display');
      // Spot-check the major framework containers are present.
      expect(hide.selector).toContain('.vjs-text-track-display');
      expect(hide.selector).toContain('.shaka-text-container');
      expect(hide.selector).toContain('[data-testid*="caption"]');
    });
  });

  describe('getDomCueSource — Phase 3 DOM fallback', () => {
    it('returns cue/window/observe selectors and display hide method', () => {
      const src = handler.getDomCueSource();
      expect(src.cueSelector).toContain('.vjs-text-track-display');
      expect(src.captionWindowSelector).toBeTruthy();
      expect(src.observeRootSelector).toBe('body');
      expect(src.captionHideMethod).toBe('display');
    });

    it('readActiveLanguage returns empty string (no reliable signal)', () => {
      const src = handler.getDomCueSource();
      expect(src.readActiveLanguage()).toBe('');
    });

    it('omits trackSwitchSelector (track-switch detection skipped)', () => {
      const src = handler.getDomCueSource();
      expect(src.trackSwitchSelector).toBeUndefined();
    });
  });

  describe('getContentTypePatterns', () => {
    it('returns subtitle content-types for the registry', () => {
      const cts = handler.getContentTypePatterns();
      expect(cts).toContain('text/vtt');
      expect(cts).toContain('application/x-subtitle');
      expect(cts).toContain('application/ttml+xml');
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 4: detect() priority — generic yields to specific handlers.
// Uses resetModules + dynamic import for a clean registry each test.
// ---------------------------------------------------------------------------

describe('GenericSubtitleHandler — detect() priority (specific > generic)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function importFresh() {
    vi.resetModules();
    const mod = await import('@/inject/subtitleHandlers/registry');
    const genericMod = await import('@/inject/subtitleHandlers/generic');
    return { ...mod, GenericSubtitleHandler: genericMod.GenericSubtitleHandler };
  }

  it('detect() returns true when no specific handler is registered', async () => {
    const { registerSubtitleHandlers, GenericSubtitleHandler } = await importFresh();
    const generic = new GenericSubtitleHandler();
    registerSubtitleHandlers([generic]);
    // Only the generic handler is registered -> it yields to nothing -> true.
    expect(generic.detect()).toBe(true);
  });

  it('detect() returns false when a specific handler detects the host', async () => {
    const { registerSubtitleHandlers, GenericSubtitleHandler } = await importFresh();
    const specific = makeMockHandler({ platform: 'youtube', detects: true });
    const generic = new GenericSubtitleHandler();
    registerSubtitleHandlers([specific, generic]);
    expect(generic.detect()).toBe(false);
  });

  it('detect() returns true when specific handlers exist but none detect', async () => {
    const { registerSubtitleHandlers, GenericSubtitleHandler } = await importFresh();
    const youtube = makeMockHandler({ platform: 'youtube', detects: false });
    const max = makeMockHandler({ platform: 'hbomax', detects: false });
    const generic = new GenericSubtitleHandler();
    registerSubtitleHandlers([youtube, max, generic]);
    expect(generic.detect()).toBe(true);
  });

  it('detectCurrentHandler returns the specific handler before generic', async () => {
    const { registerSubtitleHandlers, detectCurrentHandler, GenericSubtitleHandler } =
      await importFresh();
    const specific = makeMockHandler({ platform: 'youtube', detects: true });
    const generic = new GenericSubtitleHandler();
    registerSubtitleHandlers([specific, generic]);
    expect(detectCurrentHandler()?.platform).toBe('youtube');
  });

  it('detectCurrentHandler falls back to generic on an unknown host', async () => {
    const { registerSubtitleHandlers, detectCurrentHandler, GenericSubtitleHandler } =
      await importFresh();
    const specific = makeMockHandler({ platform: 'youtube', detects: false });
    const generic = new GenericSubtitleHandler();
    registerSubtitleHandlers([specific, generic]);
    expect(detectCurrentHandler()?.platform).toBe('generic');
  });

  it('getPatternsForCurrentHost excludes generic patterns when a specific handler detects', async () => {
    const { registerSubtitleHandlers, getPatternsForCurrentHost, GenericSubtitleHandler } =
      await importFresh();
    const specific = makeMockHandler({
      platform: 'youtube',
      detects: true,
      patterns: [/youtube\.com\/timedtext/],
    });
    const generic = new GenericSubtitleHandler();
    registerSubtitleHandlers([specific, generic]);
    const platforms = getPatternsForCurrentHost().map((p) => p.platform);
    expect(platforms).not.toContain('generic');
    expect(platforms).toContain('youtube');
  });

  it('getPatternsForCurrentHost includes generic patterns on an unknown host', async () => {
    const { registerSubtitleHandlers, getPatternsForCurrentHost, GenericSubtitleHandler } =
      await importFresh();
    const specific = makeMockHandler({ platform: 'youtube', detects: false });
    const generic = new GenericSubtitleHandler();
    registerSubtitleHandlers([specific, generic]);
    const platforms = getPatternsForCurrentHost().map((p) => p.platform);
    expect(platforms.every((p) => p === 'generic')).toBe(true);
    expect(platforms.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 5: settings toggle — handler is gated on enableGenericSubtitleHandler.
// The gating itself lives in registration (content.ts); here we assert the
// setting field exists and defaults to true.
// ---------------------------------------------------------------------------

describe('GenericSubtitleHandler — settings toggle contract', () => {
  it('DEFAULT_SUBTITLE_SETTINGS.enableGenericSubtitleHandler defaults to true', async () => {
    const { DEFAULT_SUBTITLE_SETTINGS } = await import('@/types/config');
    expect(DEFAULT_SUBTITLE_SETTINGS.enableGenericSubtitleHandler).toBe(true);
  });
});

// Allow afterEach cleanup hooks to be added without a describe if needed later.
afterEach(() => {
  vi.restoreAllMocks();
});
