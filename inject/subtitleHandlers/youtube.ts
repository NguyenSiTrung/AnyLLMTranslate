/**
 * YouTube subtitle handler.
 * Handles YouTube's /api/timedtext endpoint with srv3 XML and JSON3 formats.
 */

import type { SubtitleCue, SubtitleUrlPattern } from '@/types/subtitle';
import type { SubtitleHandler } from './registry';

export class YouTubeHandler implements SubtitleHandler {
  readonly platform = 'youtube';

  detect(): boolean {
    return /\.youtube\.com$/.test(window.location.hostname) ||
      window.location.hostname.includes('youtube.com');
  }

  getPatterns(): SubtitleUrlPattern[] {
    return [
      {
        platform: 'youtube',
        pattern: /\/api\/timedtext/,
        languageExtractor: (url) => url.searchParams.get('lang') || '',
      },
    ];
  }

  transformResponse(body: string, contentType: string, url: string): SubtitleCue[] {
    // Check response format from URL params or content type
    const urlObj = new URL(url, 'http://example.com');
    const fmt = urlObj.searchParams.get('fmt');

    if (fmt === 'json3' || contentType.includes('json')) {
      return this.parseJson3(body);
    }

    // Default to srv3 XML format
    if (body.trimStart().startsWith('<?xml') || body.trimStart().startsWith('<')) {
      return this.parseSrv3(body);
    }

    // Try JSON3 as fallback
    try {
      return this.parseJson3(body);
    } catch {
      return [];
    }
  }

  /** Parse YouTube srv3 XML format into SubtitleCue[] */
  private parseSrv3(xml: string): SubtitleCue[] {
    const cues: SubtitleCue[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const textElements = doc.querySelectorAll('text');

    for (const el of textElements) {
      const start = parseFloat(el.getAttribute('start') || '0');
      const duration = parseFloat(el.getAttribute('dur') || '0');
      const text = el.textContent?.trim() || '';

      if (text) {
        cues.push({
          startTime: start,
          endTime: start + duration,
          text,
        });
      }
    }

    return cues;
  }

  /** Parse YouTube JSON3 format into SubtitleCue[] */
  private parseJson3(json: string): SubtitleCue[] {
    interface Json3Event {
      tStartMs?: number;
      dDurationMs?: number;
      segs?: { utf8?: string; acAsr?: boolean }[];
    }
    interface Json3Data {
      events?: Json3Event[];
    }

    const data: Json3Data = JSON.parse(json);
    const cues: SubtitleCue[] = [];

    if (!data.events) return cues;

    for (const event of data.events) {
      if (!event.segs) continue;

      const text = event.segs
        .map((seg) => seg.utf8 || '')
        .join('')
        .replace(/\n/g, ' ')
        .trim();

      if (!text || text === '\n') continue;

      const startTime = (event.tStartMs || 0) / 1000;
      const endTime = startTime + (event.dDurationMs || 0) / 1000;

      cues.push({ startTime, endTime, text });
    }

    return cues;
  }
}
