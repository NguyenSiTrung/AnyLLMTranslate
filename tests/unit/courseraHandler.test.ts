import { describe, it, expect } from 'vitest';
import { CourseraHandler } from '@/inject/subtitleHandlers/coursera';

describe('CourseraHandler', () => {
  const handler = new CourseraHandler();

  it('has platform identifier', () => {
    expect(handler.platform).toBe('coursera');
  });

  describe('getPatterns', () => {
    it('returns coursera subtitle patterns', () => {
      const patterns = handler.getPatterns();
      expect(patterns.length).toBeGreaterThanOrEqual(2);
      expect(patterns[0].pattern.test('https://www.coursera.org/api/subtitle')).toBe(true);
      expect(patterns[1].pattern.test('https://www.coursera.org/subtitles/course.vtt')).toBe(true);
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
