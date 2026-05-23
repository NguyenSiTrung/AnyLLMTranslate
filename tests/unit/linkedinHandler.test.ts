import { describe, it, expect } from 'vitest';
import { LinkedInHandler } from '@/inject/subtitleHandlers/linkedin';

describe('LinkedInHandler', () => {
  const handler = new LinkedInHandler();

  it('has platform identifier', () => {
    expect(handler.platform).toBe('linkedin');
  });

  describe('detect', () => {
    it('returns true for linkedin.com hostnames', () => {
      // Mock window.location
      const originalLocation = window.location;
      
      // Test linkedin.com
      Object.defineProperty(window, 'location', {
        value: { hostname: 'linkedin.com' },
        writable: true,
        configurable: true,
      });
      expect(handler.detect()).toBe(true);

      // Test subdomains
      Object.defineProperty(window, 'location', {
        value: { hostname: 'www.linkedin.com' },
        writable: true,
        configurable: true,
      });
      expect(handler.detect()).toBe(true);

      // Test other hosts
      Object.defineProperty(window, 'location', {
        value: { hostname: 'example.com' },
        writable: true,
        configurable: true,
      });
      expect(handler.detect()).toBe(false);

      // Restore
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
      
      // Should match licdn.com VTTs
      expect(vttPattern.test('https://media.licdn.com/media/cf/subtitles/course-123_en.vtt')).toBe(true);
      expect(vttPattern.test('https://static.licdn.com/subtitles/en-US.vtt')).toBe(true);
      
      // Should match linkedin.com VTTs
      expect(vttPattern.test('https://www.linkedin.com/learning/subtitles/course.vtt')).toBe(true);
      
      // Should not match non-VTT files or other domains
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
