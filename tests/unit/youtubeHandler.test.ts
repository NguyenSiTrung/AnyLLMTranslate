import { describe, it, expect } from 'vitest';
import { YouTubeHandler } from '@/inject/subtitleHandlers/youtube';

describe('YouTubeHandler', () => {
  const handler = new YouTubeHandler();

  it('has platform identifier', () => {
    expect(handler.platform).toBe('youtube');
  });

  describe('getPatterns', () => {
    it('returns YouTube timedtext pattern', () => {
      const patterns = handler.getPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns[0].pattern.test('https://www.youtube.com/api/timedtext?v=abc')).toBe(true);
    });
  });

  describe('transformResponse', () => {
    it('parses srv3 XML format', () => {
      const xml = `<?xml version="1.0" encoding="utf-8" ?>
<transcript>
  <text start="0" dur="3.5">Hello world</text>
  <text start="3.5" dur="2.5">Second line</text>
</transcript>`;

      const cues = handler.transformResponse(xml, 'text/xml', 'https://www.youtube.com/api/timedtext?v=abc');
      expect(cues).toHaveLength(2);
      expect(cues[0].startTime).toBe(0);
      expect(cues[0].endTime).toBe(3.5);
      expect(cues[0].text).toBe('Hello world');
      expect(cues[1].startTime).toBe(3.5);
      expect(cues[1].text).toBe('Second line');
    });

    it('parses JSON3 format', () => {
      const json = JSON.stringify({
        events: [
          { tStartMs: 0, dDurationMs: 3500, segs: [{ utf8: 'Hello' }] },
          { tStartMs: 3500, dDurationMs: 2500, segs: [{ utf8: 'World' }] },
        ],
      });

      const cues = handler.transformResponse(json, 'application/json', 'https://www.youtube.com/api/timedtext?fmt=json3');
      expect(cues).toHaveLength(2);
      expect(cues[0].startTime).toBe(0);
      expect(cues[0].endTime).toBe(3.5);
      expect(cues[0].text).toBe('Hello');
      expect(cues[1].startTime).toBe(3.5);
    });

    it('skips empty events in JSON3', () => {
      const json = JSON.stringify({
        events: [
          { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '\n' }] },
          { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'Valid text' }] },
        ],
      });

      const cues = handler.transformResponse(json, 'application/json', 'https://www.youtube.com/api/timedtext?fmt=json3');
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Valid text');
    });

    it('returns empty array for unparseable content', () => {
      const cues = handler.transformResponse('not valid content', 'text/plain', 'https://example.com');
      expect(cues).toEqual([]);
    });
  });
});
