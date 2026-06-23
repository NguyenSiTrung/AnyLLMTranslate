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

  describe('extractAvailableTracks', () => {
    const apiUrl = 'https://www.udemy.com/api-2.0/lectures/4242/';

    it('preserves locale region in language (en_US vs en_GB)', () => {
      const body = JSON.stringify({
        asset: {
          captions: [
            { locale_id: 'en_US', title: 'English (US)', url: 'https://cdna.udemycdn.com/a.vtt', status: 1 },
            { locale_id: 'en_GB', title: 'English (UK)', url: 'https://cdna.udemycdn.com/b.vtt', status: 1 },
          ],
        },
      });
      const tracks = handler.extractAvailableTracks!(body, 'application/json', apiUrl);
      expect(tracks.map((t) => t.language).sort()).toEqual(['en-GB', 'en-US']);
    });

    it('maps en_US locale_id to en-US BCP-47', () => {
      const body = JSON.stringify({
        captions: [{ locale_id: 'en_US', url: 'https://cdna.udemycdn.com/x.vtt', status: 1 }],
      });
      const tracks = handler.extractAvailableTracks!(body, 'application/json', apiUrl);
      expect(tracks[0].language).toBe('en-US');
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

    it('keeps short subtitles ending in image extension without xywh', () => {
      const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
See photo.png`;

      const cues = handler.transformResponse(vtt, 'text/vtt', 'https://cdna.udemycdn.com/subtitles/course.vtt');
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('See photo.png');
    });

    it('filters sprite cues with spaces in path only when xywh present', () => {
      const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
my lecture slides.jpg`;

      const cues = handler.transformResponse(vtt, 'text/vtt', 'https://cdna.udemycdn.com/subtitles/course.vtt');
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('my lecture slides.jpg');
    });

    it('keeps long subtitles that mention image files', () => {
      const longSubtitleVtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
In this lecture we will learn how to work with jpg and png files in your project`;

      const cues = handler.transformResponse(longSubtitleVtt, 'text/vtt', 'https://cdna.udemycdn.com/subtitles/course.vtt');
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('In this lecture we will learn how to work with jpg and png files in your project');
    });
  });
});
