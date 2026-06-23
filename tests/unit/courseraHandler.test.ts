import { describe, it, expect, afterEach } from 'vitest';
import { CourseraHandler } from '@/inject/subtitleHandlers/coursera';


describe('CourseraHandler', () => {
  const handler = new CourseraHandler();
  const originalHostname = window.location.hostname;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: { hostname: originalHostname, pathname: '/' },
      writable: true,
    });
  });

  const setHostname = (hostname: string) => {
    Object.defineProperty(window, 'location', {
      value: { hostname, pathname: '/learn/course/lecture/abc' },
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
      expect(cdnPattern!.pattern.test('https://d3c33hcgiwev3.cloudfront.net/lecture/subtitle_en-US.vtt')).toBe(true);
      expect(patterns.some((p) => p.pattern.test('https://www.coursera.org/api/subtitle'))).toBe(true);
      expect(patterns.some((p) => p.pattern.test('https://www.coursera.org/subtitles/course.vtt'))).toBe(true);
    });

    it('includes CDN pattern when handler detects coursera.org host', () => {
      setHostname('www.coursera.org');
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
      const tracks = handler.extractAvailableTracks!(body, 'application/json', apiUrl);
      expect(tracks).toHaveLength(1);
      expect(tracks[0].videoId).toBe('video-from-api');
    });

    it('returns undefined videoId when not present in response or URL', () => {
      const body = JSON.stringify({
        elements: [{ subtitles: { en: 'https://cdn.example/en.vtt' } }],
      });
      const tracks = handler.extractAvailableTracks!(body, 'application/json', apiUrl);
      expect(tracks[0].videoId).toBeUndefined();
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
  });
});
