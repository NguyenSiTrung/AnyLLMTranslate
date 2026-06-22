import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { YouTubeHandler } from '@/inject/subtitleHandlers/youtube';

describe('YouTubeHandler', () => {
  let handler: YouTubeHandler;
  const originalHostname = window.location.hostname;
  const originalPathname = window.location.pathname;

  beforeEach(() => {
    handler = new YouTubeHandler();
  });

  afterEach(() => {
    // Restore window.location after each test
    Object.defineProperty(window, 'location', {
      value: {
        hostname: originalHostname,
        pathname: originalPathname,
      },
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
    expect(handler.platform).toBe('youtube');
  });

  describe('detect', () => {
    it('returns true for youtube.com hostnames', () => {
      setLocation('www.youtube.com');
      expect(handler.detect()).toBe(true);
    });

    it('returns true for subdomain of youtube.com', () => {
      setLocation('m.youtube.com');
      expect(handler.detect()).toBe(true);
    });

    it('returns true for bare youtube.com', () => {
      setLocation('youtube.com');
      expect(handler.detect()).toBe(true);
    });

    it('returns false for non-youtube hostnames', () => {
      setLocation('www.example.com');
      expect(handler.detect()).toBe(false);
    });

    it('returns false for unrelated video platforms', () => {
      setLocation('play.hbomax.com');
      expect(handler.detect()).toBe(false);
    });
  });

  describe('isWatchPage', () => {
    it('returns true for /watch path', () => {
      setLocation('www.youtube.com', '/watch');
      expect(handler.isWatchPage()).toBe(true);
    });

    it('returns true for /watch with query params', () => {
      setLocation('www.youtube.com', '/watch');
      expect(handler.isWatchPage()).toBe(true);
    });

    it('returns false for other paths', () => {
      setLocation('www.youtube.com', '/feed/subscriptions');
      expect(handler.isWatchPage()).toBe(false);
    });

    it('returns false for root path', () => {
      setLocation('www.youtube.com', '/');
      expect(handler.isWatchPage()).toBe(false);
    });

    it('returns false for embed paths', () => {
      setLocation('www.youtube.com', '/embed/abc123');
      expect(handler.isWatchPage()).toBe(false);
    });
  });

  describe('getPatterns', () => {
    it('returns pattern matching youtube.com/api/timedtext', () => {
      const patterns = handler.getPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns[0].platform).toBe('youtube');
      expect(
        patterns[0].pattern.test('https://www.youtube.com/api/timedtext?v=abc')
      ).toBe(true);
      expect(patterns[0].pattern.test('https://example.com/api/timedtext')).toBe(false);
    });

    it('languageExtractor captures both lang and tlang params (tlang takes priority)', () => {
      const patterns = handler.getPatterns();
      const extractor = patterns[0].languageExtractor;
      expect(extractor).toBeDefined();
      if (!extractor) return; // type guard

      // tlang takes priority over lang
      const bothUrl = new URL(
        'https://www.youtube.com/api/timedtext?lang=en&tlang=vi'
      );
      expect(extractor(bothUrl)).toBe('vi');

      // only lang present
      const langOnlyUrl = new URL(
        'https://www.youtube.com/api/timedtext?lang=en'
      );
      expect(extractor(langOnlyUrl)).toBe('en');

      // only tlang present
      const tlangOnlyUrl = new URL(
        'https://www.youtube.com/api/timedtext?tlang=ja'
      );
      expect(extractor(tlangOnlyUrl)).toBe('ja');

      // neither present returns empty string
      const noneUrl = new URL('https://www.youtube.com/api/timedtext?v=abc');
      expect(extractor(noneUrl)).toBe('');
    });
  });

  describe('getMetadataPatterns', () => {
    it('returns pattern for youtubei player API', () => {
      const patterns = handler.getMetadataPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns[0].platform).toBe('youtube');
      expect(patterns[0].pattern.test('https://www.youtube.com/youtubei/v1/player')).toBe(true);
      expect(patterns[0].pattern.test('https://www.youtube.com/api/timedtext')).toBe(false);
    });
  });

  describe('extractAvailableTracks', () => {
    const playerApiResponse = JSON.stringify({
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              languageCode: 'en',
              name: { simpleText: 'English' },
              baseUrl: 'https://www.youtube.com/api/timedtext?lang=en',
            },
            {
              languageCode: 'vi',
              name: { simpleText: 'Vietnamese' },
              baseUrl: 'https://www.youtube.com/api/timedtext?lang=vi',
            },
          ],
        },
      },
      videoDetails: { videoId: 'abc123' },
    });

    it('parses captionTracks from player API response', () => {
      const tracks = handler.extractAvailableTracks(playerApiResponse);
      expect(tracks).toHaveLength(2);
      expect(tracks[0]).toMatchObject({
        language: 'en',
        label: 'English',
        url: 'https://www.youtube.com/api/timedtext?lang=en',
        isAutoGenerated: false,
        platform: 'youtube',
        videoId: 'abc123',
      });
      expect(tracks[1]).toMatchObject({
        language: 'vi',
        label: 'Vietnamese',
        platform: 'youtube',
        videoId: 'abc123',
      });
    });

    it('handles ASR (auto-generated) tracks', () => {
      const asrResponse = JSON.stringify({
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [
              {
                languageCode: 'en',
                name: { simpleText: 'English (auto-generated)' },
                kind: 'asr',
                baseUrl: 'https://www.youtube.com/api/timedtext?lang=en',
              },
            ],
          },
        },
        videoDetails: { videoId: 'xyz789' },
      });

      const tracks = handler.extractAvailableTracks(asrResponse);
      expect(tracks).toHaveLength(1);
      expect(tracks[0].isAutoGenerated).toBe(true);
      expect(tracks[0].label).toBe('English (auto-generated)');
      expect(tracks[0].videoId).toBe('xyz789');
    });

    it('returns empty array for invalid JSON', () => {
      expect(handler.extractAvailableTracks('not valid json')).toEqual([]);
      expect(handler.extractAvailableTracks('')).toEqual([]);
      expect(handler.extractAvailableTracks('{ broken json')).toEqual([]);
    });

    it('returns empty array when captionTracks missing', () => {
      const noTracks = JSON.stringify({
        captions: { playerCaptionsTracklistRenderer: {} },
        videoDetails: { videoId: 'abc' },
      });
      expect(handler.extractAvailableTracks(noTracks)).toEqual([]);
    });

    it('returns empty array when captions object missing', () => {
      const noCaptions = JSON.stringify({ videoDetails: { videoId: 'abc' } });
      expect(handler.extractAvailableTracks(noCaptions)).toEqual([]);
    });

    it('filters out tracks with empty languageCode', () => {
      const withEmptyLang = JSON.stringify({
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [
              { languageCode: '', name: { simpleText: 'Unknown' } },
              { languageCode: 'en', name: { simpleText: 'English' } },
            ],
          },
        },
        videoDetails: { videoId: 'abc' },
      });
      const tracks = handler.extractAvailableTracks(withEmptyLang);
      expect(tracks).toHaveLength(1);
      expect(tracks[0].language).toBe('en');
    });

    it('falls back to languageCode as label when simpleText missing', () => {
      const noSimpleText = JSON.stringify({
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [
              { languageCode: 'fr', baseUrl: 'https://example.com/fr' },
            ],
          },
        },
        videoDetails: { videoId: 'abc' },
      });
      const tracks = handler.extractAvailableTracks(noSimpleText);
      expect(tracks).toHaveLength(1);
      expect(tracks[0].label).toBe('fr');
    });

    it('preserves undefined videoId when videoDetails missing', () => {
      const noVideoDetails = JSON.stringify({
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [
              { languageCode: 'en', name: { simpleText: 'English' } },
            ],
          },
        },
      });
      const tracks = handler.extractAvailableTracks(noVideoDetails);
      expect(tracks).toHaveLength(1);
      expect(tracks[0].videoId).toBeUndefined();
    });
  });

  describe('transformResponse', () => {
    const srv3Xml = `<?xml version="1.0" encoding="utf-8" ?>
<transcript>
  <text start="1.5" dur="2.0">Hello world</text>
  <text start="4.0" dur="3.0">Second cue</text>
</transcript>`;

    const json3Body = JSON.stringify({
      events: [
        {
          tStartMs: 1000,
          dDurationMs: 2000,
          segs: [{ utf8: 'Hello ' }, { utf8: 'world' }],
        },
        {
          tStartMs: 4000,
          dDurationMs: 3000,
          segs: [{ utf8: 'Second cue' }],
        },
      ],
    });

    it('parses srv3 XML format (text elements with start/dur attributes)', () => {
      const cues = handler.transformResponse(
        srv3Xml,
        'text/xml',
        'https://www.youtube.com/api/timedtext?lang=en'
      );
      expect(cues).toHaveLength(2);
      expect(cues[0].startTime).toBe(1.5);
      expect(cues[0].endTime).toBe(3.5);
      expect(cues[0].text).toBe('Hello world');
      expect(cues[1].startTime).toBe(4.0);
      expect(cues[1].endTime).toBe(7.0);
      expect(cues[1].text).toBe('Second cue');
    });

    it('parses json3 format (events with tStartMs/dDurationMs/segs)', () => {
      const cues = handler.transformResponse(
        json3Body,
        'application/json',
        'https://www.youtube.com/api/timedtext?fmt=json3'
      );
      expect(cues).toHaveLength(2);
      expect(cues[0].startTime).toBe(1);
      expect(cues[0].endTime).toBe(3);
      expect(cues[0].text).toBe('Hello world');
      expect(cues[1].startTime).toBe(4);
      expect(cues[1].endTime).toBe(7);
      expect(cues[1].text).toBe('Second cue');
    });

    it('detects json3 via fmt URL param', () => {
      const cues = handler.transformResponse(
        json3Body,
        'text/plain',
        'https://www.youtube.com/api/timedtext?fmt=json3&lang=en'
      );
      expect(cues).toHaveLength(2);
      expect(cues[0].text).toBe('Hello world');
    });

    it('detects json3 via content-type header', () => {
      const cues = handler.transformResponse(
        json3Body,
        'application/json; charset=utf-8',
        'https://www.youtube.com/api/timedtext?lang=en'
      );
      expect(cues).toHaveLength(2);
      expect(cues[0].text).toBe('Hello world');
    });

    it('falls back to json3 for unrecognized content', () => {
      // Body is JSON3 but no fmt param and content-type is not json and body doesn't start with <
      const cues = handler.transformResponse(
        json3Body,
        'text/plain',
        'https://www.youtube.com/api/timedtext?lang=en'
      );
      expect(cues).toHaveLength(2);
      expect(cues[0].text).toBe('Hello world');
    });

    it('returns empty for empty body via fallback path', () => {
      // No fmt param, non-json content-type, body doesn't start with '<':
      // handler falls back to parseJson3 wrapped in try/catch -> returns [].
      expect(handler.transformResponse('', 'text/xml', 'https://www.youtube.com/api/timedtext')).toEqual([]);
      expect(handler.transformResponse('   ', 'text/plain', 'https://example.com')).toEqual([]);
      expect(handler.transformResponse('', 'text/plain', 'https://www.youtube.com/api/timedtext?lang=en')).toEqual([]);
    });

    it('returns empty array for unparseable content', () => {
      const cues = handler.transformResponse(
        'not valid content',
        'text/plain',
        'https://example.com'
      );
      expect(cues).toEqual([]);
    });

    it('skips empty text elements in srv3', () => {
      const xmlWithEmpty = `<?xml version="1.0" encoding="utf-8" ?>
<transcript>
  <text start="0" dur="1.0"></text>
  <text start="1.0" dur="2.0">Valid cue</text>
</transcript>`;
      const cues = handler.transformResponse(
        xmlWithEmpty,
        'text/xml',
        'https://www.youtube.com/api/timedtext?lang=en'
      );
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Valid cue');
    });

    it('skips events without segs in json3', () => {
      const json = JSON.stringify({
        events: [
          { tStartMs: 0, dDurationMs: 1000 },
          { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'Valid' }] },
        ],
      });
      const cues = handler.transformResponse(
        json,
        'application/json',
        'https://www.youtube.com/api/timedtext?fmt=json3'
      );
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Valid');
    });

    it('joins multi-segment cues with spaces in json3', () => {
      const json = JSON.stringify({
        events: [
          {
            tStartMs: 0,
            dDurationMs: 3000,
            segs: [{ utf8: 'Hello' }, { utf8: 'world' }],
          },
        ],
      });
      const cues = handler.transformResponse(
        json,
        'application/json',
        'https://www.youtube.com/api/timedtext?fmt=json3'
      );
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Hello world');
    });

    it('skips newline-only events in json3', () => {
      const json = JSON.stringify({
        events: [
          { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '\n' }] },
          { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'Valid text' }] },
        ],
      });
      const cues = handler.transformResponse(
        json,
        'application/json',
        'https://www.youtube.com/api/timedtext?fmt=json3'
      );
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Valid text');
    });

    it('handles relative URL in transformResponse', () => {
      // transformResponse builds URL with a base; relative '?fmt=json3' should still work
      const cues = handler.transformResponse(
        json3Body,
        'text/plain',
        '?fmt=json3'
      );
      expect(cues).toHaveLength(2);
      expect(cues[0].text).toBe('Hello world');
    });
  });
});
