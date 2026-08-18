// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { YoukuHandler, youkuCodeToLanguage } from '@/inject/subtitleHandlers/youku';
import { YouTubeHandler } from '@/inject/subtitleHandlers/youtube';
import { DisneyPlusHandler } from '@/inject/subtitleHandlers/disneyplus';
import { WetvHandler } from '@/inject/subtitleHandlers/wetv';
import { GenericSubtitleHandler } from '@/inject/subtitleHandlers/generic';
import { LinkedInHandler, parseLinkedInTranscriptJson } from '@/inject/subtitleHandlers/linkedin';

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

describe('LinkedInHandler', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'www.linkedin.com',
        pathname: '/learning/programming-foundations-fundamentals/welcome',
        href: 'https://www.linkedin.com/learning/programming-foundations-fundamentals/welcome',
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

  const DETAILED_COURSES_URL =
    'https://www.linkedin.com/learning-api/detailedCourses?courseSlug=programming-foundations-fundamentals&fields=selectedVideo&q=slugs&videoSlug=welcome&resolution=_720';

  const TRANSCRIPT_JSON = JSON.stringify({
    elements: [
      {
        selectedVideo: {
          primaryLocale: { country: 'US', language: 'en' },
          durationInSeconds: 5,
          transcript: {
            lines: [
              { transcriptStartAt: 0, caption: 'Welcome to the course.' },
              { transcriptStartAt: 2500, caption: 'Let us get started.' },
              { transcriptStartAt: 4000, caption: 'Here is the final thought.' },
            ],
          },
        },
      },
    ],
  });

  it('detects LinkedIn hosts and gates watch pages on /learning/', () => {
    const handler = new LinkedInHandler();
    expect(handler.detect()).toBe(true);
    expect(handler.isWatchPage()).toBe(true);

    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.linkedin.com', pathname: '/feed/', href: 'https://www.linkedin.com/feed/' },
      writable: true,
      configurable: true,
    });
    expect(handler.isWatchPage()).toBe(false);
  });

  it('matches the detailedCourses transcript API, ambry captions, and legacy .vtt URLs', () => {
    const handler = new LinkedInHandler();
    const patterns = handler.getPatterns();
    const [coursesPattern, ambryPattern, vttPattern] = patterns;
    expect(coursesPattern.pattern.test(DETAILED_COURSES_URL)).toBe(true);
    expect(coursesPattern.pattern.test('https://www.linkedin.com/learning-api/detailedCourses?q=slugs')).toBe(true);
    expect(coursesPattern.pattern.test('https://www.linkedin.com/feed/')).toBe(false);

    // Player's data-captions-url (ambry blob endpoint, no .vtt extension)
    expect(ambryPattern.pattern.test('https://www.linkedin.com/ambry/?x-li-ambry-ep=AQLd5zZBGfhHMAAAAZ_VVvrTEtBQArWkHa12K')).toBe(true);
    expect(ambryPattern.pattern.test('https://www.linkedin.com/learning-api/detailedCourses?q=slugs')).toBe(false);

    expect(vttPattern.pattern.test('https://video.licdn.com/rest/v1/subtitle_en.vtt?x=1')).toBe(true);
    const { languageExtractor } = vttPattern;
    if (languageExtractor) {
      expect(languageExtractor(new URL('https://video.licdn.com/rest/v1/subtitle_en.vtt?x=1'))).toBe('en');
      expect(languageExtractor(new URL('https://video.licdn.com/rest/v1/subtitle-en_US.vtt'))).toBe('en-US');
      expect(languageExtractor(new URL(DETAILED_COURSES_URL))).toBe('');
    }
  });

  it('parses detailedCourses transcript JSON into timed cues, with duration+2s fallback and empty results for invalid input', () => {
    const cues = parseLinkedInTranscriptJson(TRANSCRIPT_JSON);
    expect(cues).toEqual([
      { startTime: 0, endTime: 2.5, text: 'Welcome to the course.' },
      { startTime: 2.5, endTime: 4, text: 'Let us get started.' },
      // Last cue ends at the video duration.
      { startTime: 4, endTime: 5, text: 'Here is the final thought.' },
    ]);

    const noDuration = JSON.stringify({
      transcript: {
        lines: [
          { transcriptStartAt: 1000, caption: 'Only cue.' },
        ],
      },
    });
    expect(parseLinkedInTranscriptJson(noDuration)).toEqual([
      { startTime: 1, endTime: 3, text: 'Only cue.' },
    ]);

    // Course-listing payload (chapters only, no selectedVideo transcript)
    const listing = JSON.stringify({
      elements: [{ chapters: [], description: 'x', title: 'y' }],
    });
    expect(parseLinkedInTranscriptJson(listing)).toEqual([]);
    expect(parseLinkedInTranscriptJson('not json')).toEqual([]);
    expect(parseLinkedInTranscriptJson('[]')).toEqual([]);
  });

  it('transforms both JSON transcripts and legacy VTT bodies', () => {
    const handler = new LinkedInHandler();
    const jsonCues = handler.transformResponse(TRANSCRIPT_JSON, 'application/json', DETAILED_COURSES_URL);
    expect(jsonCues.length).toBe(3);
    // Body-prefix detection works even with a missing/odd Content-Type.
    expect(handler.transformResponse(TRANSCRIPT_JSON, 'text/plain', DETAILED_COURSES_URL).length).toBe(3);

    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n';
    const vttCues = handler.transformResponse(vtt, 'text/vtt', 'https://video.licdn.com/rest/v1/subtitle_en.vtt');
    expect(vttCues).toEqual([{ startTime: 1, endTime: 2, text: 'Hello' }]);
  });

  it('extracts tracks from legacy arrays and from the detailedCourses transcript', () => {
    const handler = new LinkedInHandler();

    const legacy = JSON.stringify({
      subtitles: [
        { language: 'en', label: 'English', url: 'https://video.licdn.com/rest/v1/subtitle_en.vtt' },
        { language: 'de', label: 'Deutsch' },
      ],
    });
    const legacyTracks = handler.extractAvailableTracks(legacy, 'application/json', 'https://www.linkedin.com/api/transcript');
    expect(legacyTracks).toHaveLength(2);
    expect(legacyTracks[0]).toMatchObject({ language: 'en', url: 'https://video.licdn.com/rest/v1/subtitle_en.vtt' });

    const transcriptTracks = handler.extractAvailableTracks(TRANSCRIPT_JSON, 'application/json', DETAILED_COURSES_URL);
    expect(transcriptTracks).toHaveLength(1);
    expect(transcriptTracks[0]).toMatchObject({ language: 'en', platform: 'linkedin' });
    expect(transcriptTracks[0].url).toBeUndefined();

    expect(handler.extractAvailableTracks('{"elements":[]}', 'application/json', DETAILED_COURSES_URL)).toEqual([]);
  });

  it('hides the video.js emulated caption window while the overlay is active', () => {
    const handler = new LinkedInHandler();
    expect(handler.getNativeCaptionHide()).toEqual({ selector: '.vjs-text-track-display' });
  });
});
