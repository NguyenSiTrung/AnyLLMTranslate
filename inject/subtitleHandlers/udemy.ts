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
        pattern: /\.udemycdn\.com\/.*\.vtt/,
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
    return parseWebVTT(body);
  }
}
