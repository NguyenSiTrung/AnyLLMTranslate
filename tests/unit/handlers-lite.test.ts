/**
 * Combined tests for smaller platform subtitle handlers.
 * Merged from disneyplusHandler, wetvHandler, linkedinHandler, netflixHandler
 * to reduce jsdom environment spin-ups.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DisneyPlusHandler,
  extractDisneyPlusTracksFromValue,
} from '@/inject/subtitleHandlers/disneyplus';
import { WetvHandler } from '@/inject/subtitleHandlers/wetv';
import { LinkedInHandler } from '@/inject/subtitleHandlers/linkedin';
import {
  NetflixHandler,
  extractNetflixTracksFromValue,
} from '@/inject/subtitleHandlers/netflix';

// ---------------------------------------------------------------------------
// DisneyPlusHandler
// ---------------------------------------------------------------------------
describe('DisneyPlusHandler', () => {
  const handler = new DisneyPlusHandler();
  const originalHostname = window.location.hostname;
  const originalPathname = window.location.pathname;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: { hostname: originalHostname, pathname: originalPathname },
      writable: true,
    });
  });

  const setLocation = (hostname: string, pathname: string = '/') => {
    Object.defineProperty(window, 'location', {
      value: { hostname, pathname },
      writable: true,
    });
  };

  describe('detect', () => {
    it('returns true for www.disneyplus.com', () => {
      setLocation('www.disneyplus.com');
      expect(handler.detect()).toBe(true);
    });
  });

  describe('getPatterns', () => {
    it('matches .vtt subtitle URLs', () => {
      const patterns = handler.getPatterns();
      expect(patterns[0].pattern.test('https://cdn.disneyplus.com/sub/en/file.vtt')).toBe(true);
    });
  });

  describe('extractDisneyPlusTracksFromValue', () => {
    it('parses asset.captions', () => {
      const tracks = extractDisneyPlusTracksFromValue({
        asset: {
          id: 'entity-1',
          captions: [
            { language: 'en', label: 'English', url: 'https://cdn.example/en.vtt' },
            { lang: 'es', name: 'Spanish', href: 'https://cdn.example/es.vtt' },
          ],
        },
      });
      expect(tracks).toHaveLength(2);
      expect(tracks[0].videoId).toBe('entity-1');
      expect(tracks[1].language).toBe('es');
    });
  });
});

// ---------------------------------------------------------------------------
// WetvHandler
// ---------------------------------------------------------------------------
describe('WetvHandler', () => {
  let handler: WetvHandler;

  beforeEach(() => {
    handler = new WetvHandler();
  });

  describe('detect', () => {
    it.each([
      ['www.iflix.com'],
      ['wetv.vip'],
      ['play.wetv.vip'],
    ])('detects %s', (host) => {
      vi.stubGlobal('location', { hostname: host, pathname: '/play/123' });
      expect(handler.detect()).toBe(true);
    });

    it.each([['www.youtube.com'], ['wetv.evil.com']])('rejects %s', (host) => {
      vi.stubGlobal('location', { hostname: host, pathname: '/x' });
      expect(handler.detect()).toBe(false);
    });
  });

  describe('getPatterns', () => {
    it('matches .vtt URLs (Immersive iflix rule)', () => {
      const patterns = handler.getPatterns();
      expect(patterns[0].pattern.test('https://cdn.example/sub_en.vtt')).toBe(true);
      expect(patterns[0].pattern.test('https://cdn.example/manifest.m3u8')).toBe(false);
    });
  });

  describe('transformResponse', () => {
    it('parses WebVTT', () => {
      const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hi`;
      const cues = handler.transformResponse(vtt, 'text/vtt', 'https://x/a.vtt');
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Hi');
    });
  });

  describe('getNativeCaptionHide', () => {
    it('hides .text-track per Immersive attachRule', () => {
      expect(handler.getNativeCaptionHide?.()).toEqual({
        selector: '.text-track',
        method: 'display',
      });
    });
  });
});

// ---------------------------------------------------------------------------
// LinkedInHandler
// ---------------------------------------------------------------------------
describe('LinkedInHandler', () => {
  const handler = new LinkedInHandler();

  describe('detect', () => {
    it('returns true for linkedin.com hostnames', () => {
      const originalLocation = window.location;

      Object.defineProperty(window, 'location', {
        value: { hostname: 'linkedin.com' },
        writable: true,
        configurable: true,
      });
      expect(handler.detect()).toBe(true);

      Object.defineProperty(window, 'location', {
        value: { hostname: 'www.linkedin.com' },
        writable: true,
        configurable: true,
      });
      expect(handler.detect()).toBe(true);

      Object.defineProperty(window, 'location', {
        value: { hostname: 'example.com' },
        writable: true,
        configurable: true,
      });
      expect(handler.detect()).toBe(false);

      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('getPatterns', () => {
    it('returns licdn and linkedin VTT patterns', () => {
      const patterns = handler.getPatterns();
      expect(patterns.length).toBeGreaterThanOrEqual(1);

      const vttPattern = patterns[0].pattern;

      expect(vttPattern.test('https://media.licdn.com/media/cf/subtitles/course-123_en.vtt')).toBe(true);
      expect(vttPattern.test('https://static.licdn.com/subtitles/en-US.vtt')).toBe(true);
      expect(vttPattern.test('https://www.linkedin.com/learning/subtitles/course.vtt')).toBe(true);
      expect(vttPattern.test('https://media.licdn.com/media/image.png')).toBe(false);
      expect(vttPattern.test('https://example.com/subtitles.vtt')).toBe(false);
    });

    it('extracts language from URL query parameter', () => {
      const patterns = handler.getPatterns();
      const extractor = patterns[0].languageExtractor;

      if (extractor) {
        const url1 = new URL('https://media.licdn.com/subtitles/course.vtt?lang=en');
        expect(extractor(url1)).toBe('en');

        const url2 = new URL('https://media.licdn.com/subtitles/course.vtt?locale=vi-VN');
        expect(extractor(url2)).toBe('vi-VN');
      }
    });

    it('extracts language from URL path segments', () => {
      const patterns = handler.getPatterns();
      const extractor = patterns[0].languageExtractor;

      if (extractor) {
        const url1 = new URL('https://media.licdn.com/subtitles/en/course.vtt');
        expect(extractor(url1)).toBe('en');

        const url2 = new URL('https://media.licdn.com/subtitles/vi-VN/course.vtt');
        expect(extractor(url2)).toBe('vi-VN');

        const url3 = new URL('https://media.licdn.com/subtitles/fr_FR/course.vtt');
        expect(extractor(url3)).toBe('fr-FR');
      }
    });

    it('extracts language from URL filename suffix', () => {
      const patterns = handler.getPatterns();
      const extractor = patterns[0].languageExtractor;

      if (extractor) {
        const url1 = new URL('https://media.licdn.com/subtitles/course_en.vtt');
        expect(extractor(url1)).toBe('en');

        const url2 = new URL('https://media.licdn.com/subtitles/course_vi-VN.vtt');
        expect(extractor(url2)).toBe('vi-VN');

        const url3 = new URL('https://media.licdn.com/subtitles/course_fr_FR.vtt');
        expect(extractor(url3)).toBe('fr-FR');
      }
    });
  });

  describe('transformResponse', () => {
    it('parses standard WebVTT', () => {
      const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
LinkedIn subtitle line`;

      const cues = handler.transformResponse(vtt, 'text/vtt', 'https://media.licdn.com/subtitles/course_en.vtt');
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('LinkedIn subtitle line');
      expect(cues[0].startTime).toBe(1);
      expect(cues[0].endTime).toBe(4);
    });
  });
});

// ---------------------------------------------------------------------------
// NetflixHandler
// ---------------------------------------------------------------------------
describe('NetflixHandler', () => {
  const handler = new NetflixHandler();
  const originalHostname = window.location.hostname;
  const originalPathname = window.location.pathname;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: { hostname: originalHostname, pathname: originalPathname },
      writable: true,
    });
  });

  const setLocation = (hostname: string, pathname: string = '/') => {
    Object.defineProperty(window, 'location', {
      value: { hostname, pathname },
      writable: true,
    });
  };

  describe('detect', () => {
    it('returns true for www.netflix.com', () => {
      setLocation('www.netflix.com');
      expect(handler.detect()).toBe(true);
    });

    it('returns false for notnetflix.com', () => {
      setLocation('notnetflix.com');
      expect(handler.detect()).toBe(false);
    });
  });

  describe('getPatterns', () => {
    it('matches nflxvideo.net subtitle URLs', () => {
      const patterns = handler.getPatterns();
      expect(
        patterns[0].pattern.test(
          'https://abc123.oca.nflxvideo.net/?o=1&e=2&t=3&v=4',
        ),
      ).toBe(true);
    });
  });

  describe('extractNetflixTracksFromValue', () => {
    it('parses timedtexttracks from result wrapper', () => {
      const tracks = extractNetflixTracksFromValue({
        result: {
          movieId: '80057281',
          timedtexttracks: [
            {
              bcp47: 'en',
              displayName: 'English',
              href: 'https://x.oca.nflxvideo.net/?o=1',
            },
            { isImageBased: true, language: 'en' },
          ],
        },
      });
      expect(tracks).toHaveLength(1);
      expect(tracks[0].language).toBe('en');
      expect(tracks[0].videoId).toBe('80057281');
      expect(tracks[0].platform).toBe('netflix');
    });
  });

  describe('extractAvailableTracks', () => {
    it('reads pre-wrapped tracks from JSON.parse hook payload', () => {
      const body = JSON.stringify({
        tracks: [{ language: 'vi', label: 'Vietnamese', platform: 'netflix', isAutoGenerated: false }],
      });
      const tracks = handler.extractAvailableTracks?.(body, 'application/json', '') ?? [];
      expect(tracks[0].language).toBe('vi');
    });
  });
});
