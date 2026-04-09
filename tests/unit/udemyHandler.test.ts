import { describe, it, expect } from 'vitest';
import { UdemyHandler } from '@/inject/subtitleHandlers/udemy';

describe('UdemyHandler', () => {
  const handler = new UdemyHandler();

  it('has platform identifier', () => {
    expect(handler.platform).toBe('udemy');
  });

  describe('getPatterns', () => {
    it('returns udemycdn VTT pattern', () => {
      const patterns = handler.getPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns[0].pattern.test('https://cdna.udemycdn.com/subtitles/course-en.vtt')).toBe(true);
      expect(patterns[0].pattern.test('https://example.com/not-udemy.vtt')).toBe(false);
    });
  });

  describe('transformResponse', () => {
    it('parses standard WebVTT', () => {
      const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Udemy subtitle line`;

      const cues = handler.transformResponse(vtt, 'text/vtt', 'https://cdna.udemycdn.com/subtitles/course.vtt');
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Udemy subtitle line');
    });
  });
});
