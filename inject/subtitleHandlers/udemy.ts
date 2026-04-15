/**
 * Udemy subtitle handler.
 * Handles VTT subtitle requests from udemycdn.com.
 */

import type { SubtitleCue, SubtitleUrlPattern } from '@/types/subtitle';
import type { SubtitleHandler } from './registry';
import { parseWebVTT } from '@/lib/subtitleParser';

export class UdemyHandler implements SubtitleHandler {
  readonly platform = 'udemy';

  detect(): boolean {
    return window.location.hostname.includes('udemy.com');
  }

  getPatterns(): SubtitleUrlPattern[] {
    return [
      {
        platform: 'udemy',
        pattern: /\.udemycdn\.com\/(?!.*(sprite|thumbnail|board)).*\.vtt/,
        languageExtractor: (url) => {
          const pathParts = url.pathname.split('/');
          // Language is usually in the path: /subtitle-en/ or /en/
          const langMatch = pathParts.find((p) => /^[a-z]{2}(-[A-Z]{2})?$/.test(p));
          return langMatch || '';
        },
      },
    ];
  }

  transformResponse(body: string, _contentType: string, _url: string): SubtitleCue[] {
    // Udemy subtitles are standard WebVTT
    const cues = parseWebVTT(body);

    // Early-exit heuristic: if the first cue is a sprite metadata, drop the whole track
    if (cues.length > 0) {
      const firstCueText = cues[0].text.trim();
      if (firstCueText.match(/\.(jpg|png|jpeg|webp|gif)/i) || firstCueText.includes('#xywh=')) {
        return [];
      }
    }

    // Cue-level filtering: remove cues that match image file coordinate syntaxes
    return cues.filter((cue) => {
      const text = cue.text.trim();
      // Filter out cues that look like image file paths with coordinates
      return !(text.match(/\.(jpg|png|jpeg|webp|gif)/i) || text.includes('#xywh='));
    });
  }
}
