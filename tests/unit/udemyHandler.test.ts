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

    it('returns empty array for sprite metadata VTT', () => {
      const spriteVtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
thumb-sprites.jpg#xywh=0,0,100,100`;

      const cues = handler.transformResponse(spriteVtt, 'text/vtt', 'https://cdna.udemycdn.com/subtitles/sprite.vtt');
      expect(cues).toHaveLength(0);
    });

    it('returns empty array for PNG sprite metadata', () => {
      const pngSpriteVtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
thumbnail.png#xywh=10,20,200,150`;

      const cues = handler.transformResponse(pngSpriteVtt, 'text/vtt', 'https://cdna.udemycdn.com/subtitles/thumb.vtt');
      expect(cues).toHaveLength(0);
    });

    it('filters out sprite cues from mixed content', () => {
      const mixedVtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
thumb-sprites.jpg#xywh=0,0,100,100

2
00:00:05.000 --> 00:00:08.000
Normal subtitle text`;

      const cues = handler.transformResponse(mixedVtt, 'text/vtt', 'https://cdna.udemycdn.com/subtitles/course.vtt');
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Normal subtitle text');
    });
  });
});
