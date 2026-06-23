import { describe, it, expect, afterEach, vi } from 'vitest';
import { CourseraHandler } from '@/inject/subtitleHandlers/coursera';


describe('CourseraHandler', () => {
  const handler = new CourseraHandler();
  const extractTracks = (body: string, contentType: string, url: string) => {
    if (!handler.extractAvailableTracks) throw new Error('extractAvailableTracks missing');
    return handler.extractAvailableTracks(body, contentType, url);
  };
  const originalHostname = window.location.hostname;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: { hostname: originalHostname, pathname: '/' },
      writable: true,
    });
  });

  const setLocation = (hostname: string, pathname: string = '/') => {
    Object.defineProperty(window, 'location', {
      value: { hostname, pathname },
      writable: true,
    });
  };

  it('has platform identifier', () => {
    expect(handler.platform).toBe('coursera');
  });

  describe('getPatterns', () => {
    it('returns coursera subtitle patterns including CDN VTT', () => {
      const patterns = handler.getPatterns();
      expect(patterns.length).toBeGreaterThanOrEqual(3);
      const cdnPattern = patterns.find((p) => p.pattern.test('https://d3c33hcgiwev3.cloudfront.net/foo_en.vtt'));
      expect(cdnPattern).toBeDefined();
      expect(cdnPattern?.pattern.test('https://d3c33hcgiwev3.cloudfront.net/lecture/subtitle_en-US.vtt')).toBe(true);
      expect(patterns.some((p) => p.pattern.test('https://www.coursera.org/api/subtitle'))).toBe(true);
      expect(patterns.some((p) => p.pattern.test('https://www.coursera.org/subtitles/course.vtt'))).toBe(true);
    });

    it('includes CDN pattern when handler detects coursera.org host', () => {
      setLocation('www.coursera.org', '/learn/course/lecture/abc');
      expect(handler.detect()).toBe(true);
      const patterns = handler.getPatterns();
      expect(
        patterns.some((p) => p.pattern.test('https://d3c33hcgiwev3.cloudfront.net/course/subtitle_en.vtt')),
      ).toBe(true);
    });

    it('extracts language from CDN VTT filename', () => {
      const patterns = handler.getPatterns();
      const cdn = patterns.find((p) => p.pattern.test('https://x.cloudfront.net/a/subtitle_en-US.vtt'));
      expect(cdn?.languageExtractor?.(new URL('https://x.cloudfront.net/a/subtitle_en-US.vtt'))).toBe('en-US');
    });
  });

  describe('detect', () => {
    it('returns true for coursera.org and www.coursera.org', () => {
      setLocation('www.coursera.org');
      expect(handler.detect()).toBe(true);
      setLocation('coursera.org');
      expect(handler.detect()).toBe(true);
    });

    it('returns false for spoofed notcoursera.org', () => {
      setLocation('notcoursera.org');
      expect(handler.detect()).toBe(false);
    });
  });

  describe('isWatchPage', () => {
    it('returns true on lecture paths', () => {
      setLocation('www.coursera.org', '/learn/foo/lecture/bar');
      expect(handler.isWatchPage()).toBe(true);
    });

    it('returns false off lecture paths', () => {
      setLocation('www.coursera.org', '/browse');
      expect(handler.isWatchPage()).toBe(false);
    });
  });

  describe('getMetadataPatterns', () => {
    it('matches onDemand lecture APIs', () => {
      const patterns = handler.getMetadataPatterns?.() ?? [];
      expect(patterns).toHaveLength(2);
      expect(patterns[0].pattern.test('https://www.coursera.org/api/onDemandLectureVideos.v1')).toBe(true);
      expect(patterns[1].pattern.test('https://www.coursera.org/api/onDemandLectures.v1')).toBe(true);
    });
  });

  describe('extractAvailableTracks', () => {
    const apiUrl =
      'https://www.coursera.org/api/onDemandLectureVideos.v1?q=video&lectureId=lecture-xyz';

    it('returns videoId from API element id', () => {
      const body = JSON.stringify({
        elements: [
          {
            id: 'video-from-api',
            subtitles: { en: 'https://cdn.example/en.vtt' },
          },
        ],
      });
      const tracks = extractTracks(body, 'application/json', apiUrl);
      expect(tracks).toHaveLength(1);
      expect(tracks[0].videoId).toBe('video-from-api');
    });

    it('returns undefined videoId when not present in response or URL', () => {
      const body = JSON.stringify({
        elements: [{ subtitles: { en: 'https://cdn.example/en.vtt' } }],
      });
      const tracks = extractTracks(body, 'application/json', apiUrl);
      expect(tracks[0].videoId).toBeUndefined();
    });

    it('handles subtitlesVtt array of languageCode and url', () => {
      const body = JSON.stringify({
        elements: [
          {
            id: 'vid-1',
            subtitlesVtt: [
              { languageCode: 'en', url: 'https://cdn/en.vtt' },
              { languageCode: 'es', url: 'https://cdn/es.vtt' },
            ],
          },
        ],
      });
      const tracks = extractTracks(body, 'application/json', apiUrl);
      expect(tracks.map((t) => t.language).sort()).toEqual(['en', 'es']);
    });

    it('handles subtitles map format', () => {
      const body = JSON.stringify({
        elements: [{ subtitles: { de: 'https://cdn/de.vtt', fr: 'https://cdn/fr.vtt' } }],
      });
      const tracks = extractTracks(body, 'application/json', apiUrl);
      expect(tracks).toHaveLength(2);
    });

    it('dedupes subtitleLanguageCodes already in subtitles map', () => {
      const body = JSON.stringify({
        elements: [
          {
            subtitles: { en: 'https://cdn/en.vtt' },
            subtitleLanguageCodes: ['en', 'ja'],
          },
        ],
      });
      const tracks = extractTracks(body, 'application/json', apiUrl);
      expect(tracks.map((t) => t.language).sort()).toEqual(['en', 'ja']);
    });

    it('returns empty array for malformed JSON', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(extractTracks('not-json', 'application/json', apiUrl)).toEqual([]);
      warn.mockRestore();
    });

    it('parses realistic onDemandLectureVideos API fixture', () => {
      const body = JSON.stringify({
        elements: [
          {
            id: 'lecture-video-99',
            subtitles: { en: 'https://d3c33hcgiwev3.cloudfront.net/en.vtt' },
            subtitleLanguageCodes: ['en', 'zh-CN'],
            subtitlesVtt: [{ languageCode: 'ja', url: 'https://d3c33hcgiwev3.cloudfront.net/ja.vtt' }],
          },
        ],
      });
      const tracks = extractTracks(body, 'application/json', apiUrl);
      expect(tracks.some((t) => t.language === 'en' && t.videoId === 'lecture-video-99')).toBe(true);
      expect(tracks.some((t) => t.language === 'ja')).toBe(true);
      expect(tracks.some((t) => t.language === 'zh-CN')).toBe(true);
    });

    it('parses onDemandLectures linked elements', () => {
      const body = JSON.stringify({
        linked: {
          subtitles: { de: 'https://cdn/de.vtt' },
          subtitleLanguageCodes: ['de'],
        },
      });
      const tracks = extractTracks(body, 'application/json', apiUrl);
      expect(tracks).toHaveLength(1);
      expect(tracks[0].language).toBe('de');
    });
  });

  describe('transformResponse', () => {
    it('parses standard WebVTT', () => {
      const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Coursera subtitle line`;

      const cues = handler.transformResponse(vtt, 'text/vtt', 'https://www.coursera.org/api/subtitle');
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Coursera subtitle line');
    });

    it('parses SRT via parseSubtitles', () => {
      const srt = `1
00:00:01,000 --> 00:00:04,000
Coursera SRT line`;

      const cues = handler.transformResponse(srt, 'application/x-subrip', 'https://www.coursera.org/sub.vtt');
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Coursera SRT line');
    });
  });

  describe('language extractors', () => {
    it('extracts 3-letter code from coursera vtt filename', () => {
      const patterns = handler.getPatterns();
      const vttPat = patterns.find((p) => p.pattern.test('https://www.coursera.org/x/track_fil.vtt'));
      const url = new URL('https://www.coursera.org/assets/course/track_fil.vtt');
      expect(vttPat?.languageExtractor?.(url)).toBe('fil');
    });
  });
});
