/**
 * Combined tests for smaller platform subtitle handlers.
 * Merged from disneyplusHandler, wetvHandler, linkedinHandler, netflixHandler
 * to reduce jsdom environment spin-ups.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
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

const setLocation = (hostname: string, pathname: string = '/') => {
  Object.defineProperty(window, 'location', {
    value: { hostname, pathname },
    writable: true,
    configurable: true,
  });
};

describe('platform handlers (disney/wetv)', () => {
  const originalHostname = window.location.hostname;
  const originalPathname = window.location.pathname;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: { hostname: originalHostname, pathname: originalPathname },
      writable: true,
      configurable: true,
    });
    vi.unstubAllGlobals?.();
  });

  it('Disney+ and WeTV detect hosts, match VTT, parse tracks/cues', () => {
    const disney = new DisneyPlusHandler();
    setLocation('www.disneyplus.com');
    expect(disney.detect()).toBe(true);
    expect(
      disney.getPatterns()[0].pattern.test('https://cdn.disneyplus.com/sub/en/file.vtt'),
    ).toBe(true);

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

    const wetv = new WetvHandler();
    for (const host of ['www.iflix.com', 'wetv.vip', 'play.wetv.vip']) {
      vi.stubGlobal('location', { hostname: host, pathname: '/play/123' });
      expect(wetv.detect()).toBe(true);
    }
    for (const host of ['www.youtube.com', 'wetv.evil.com']) {
      vi.stubGlobal('location', { hostname: host, pathname: '/x' });
      expect(wetv.detect()).toBe(false);
    }

    const patterns = wetv.getPatterns();
    expect(patterns[0].pattern.test('https://cdn.example/sub_en.vtt')).toBe(true);
    expect(patterns[0].pattern.test('https://cdn.example/manifest.m3u8')).toBe(false);

    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
Hi`;
    const cues = wetv.transformResponse(vtt, 'text/vtt', 'https://x/a.vtt');
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Hi');

    expect(wetv.getNativeCaptionHide?.()).toEqual({
      selector: '.text-track',
      method: 'display',
    });
  });
});

describe('platform handlers (linkedin/netflix)', () => {
  const originalLocation = window.location;
  const originalHostname = window.location.hostname;
  const originalPathname = window.location.pathname;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation.hostname
        ? { hostname: originalHostname, pathname: originalPathname }
        : originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('LinkedIn and Netflix detect, match URLs, extract language/tracks, parse VTT', () => {
    const linkedin = new LinkedInHandler();

    Object.defineProperty(window, 'location', {
      value: { hostname: 'linkedin.com' },
      writable: true,
      configurable: true,
    });
    expect(linkedin.detect()).toBe(true);

    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.linkedin.com' },
      writable: true,
      configurable: true,
    });
    expect(linkedin.detect()).toBe(true);

    Object.defineProperty(window, 'location', {
      value: { hostname: 'example.com' },
      writable: true,
      configurable: true,
    });
    expect(linkedin.detect()).toBe(false);

    const liPatterns = linkedin.getPatterns();
    expect(liPatterns.length).toBeGreaterThanOrEqual(1);
    const vttPattern = liPatterns[0].pattern;
    const extractor = liPatterns[0].languageExtractor;

    expect(vttPattern.test('https://media.licdn.com/media/cf/subtitles/course-123_en.vtt')).toBe(true);
    expect(vttPattern.test('https://static.licdn.com/subtitles/en-US.vtt')).toBe(true);
    expect(vttPattern.test('https://www.linkedin.com/learning/subtitles/course.vtt')).toBe(true);
    expect(vttPattern.test('https://media.licdn.com/media/image.png')).toBe(false);
    expect(vttPattern.test('https://example.com/subtitles.vtt')).toBe(false);

    expect(extractor).toBeDefined();
    if (extractor) {
      expect(extractor(new URL('https://media.licdn.com/subtitles/course.vtt?lang=en'))).toBe('en');
      expect(extractor(new URL('https://media.licdn.com/subtitles/course.vtt?locale=vi-VN'))).toBe('vi-VN');
      expect(extractor(new URL('https://media.licdn.com/subtitles/en/course.vtt'))).toBe('en');
      expect(extractor(new URL('https://media.licdn.com/subtitles/vi-VN/course.vtt'))).toBe('vi-VN');
      expect(extractor(new URL('https://media.licdn.com/subtitles/fr_FR/course.vtt'))).toBe('fr-FR');
      expect(extractor(new URL('https://media.licdn.com/subtitles/course_en.vtt'))).toBe('en');
      expect(extractor(new URL('https://media.licdn.com/subtitles/course_vi-VN.vtt'))).toBe('vi-VN');
      expect(extractor(new URL('https://media.licdn.com/subtitles/course_fr_FR.vtt'))).toBe('fr-FR');
    }

    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
LinkedIn subtitle line`;
    const cues = linkedin.transformResponse(
      vtt,
      'text/vtt',
      'https://media.licdn.com/subtitles/course_en.vtt',
    );
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ text: 'LinkedIn subtitle line', startTime: 1, endTime: 4 });

    const netflix = new NetflixHandler();
    setLocation('www.netflix.com');
    expect(netflix.detect()).toBe(true);
    setLocation('notnetflix.com');
    expect(netflix.detect()).toBe(false);

    expect(
      netflix.getPatterns()[0].pattern.test('https://abc123.oca.nflxvideo.net/?o=1&e=2&t=3&v=4'),
    ).toBe(true);

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
    expect(tracks[0]).toMatchObject({ language: 'en', videoId: '80057281', platform: 'netflix' });

    const body = JSON.stringify({
      tracks: [{ language: 'vi', label: 'Vietnamese', platform: 'netflix', isAutoGenerated: false }],
    });
    const fromPayload = netflix.extractAvailableTracks?.(body, 'application/json', '') ?? [];
    expect(fromPayload[0].language).toBe('vi');
  });
});
