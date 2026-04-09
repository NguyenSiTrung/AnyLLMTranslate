/**
 * Coursera subtitle handler.
 * Handles VTT subtitle requests from coursera.org.
 */

import type { SubtitleCue, SubtitleUrlPattern } from '@/types/subtitle';
import type { SubtitleHandler } from './registry';
import { parseWebVTT } from '@/lib/subtitleParser';

export class CourseraHandler implements SubtitleHandler {
  readonly platform = 'coursera';

  detect(): boolean {
    return window.location.hostname.includes('coursera.org');
  }

  getPatterns(): SubtitleUrlPattern[] {
    return [
      {
        platform: 'coursera',
        pattern: /coursera\.org\/.*subtitle/,
        languageExtractor: (url) => {
          // Language often in query param or path segment
          const lang = url.searchParams.get('lang') || '';
          if (lang) return lang;
          const match = url.pathname.match(/\/([a-z]{2}(-[A-Z]{2})?)\//);
          return match?.[1] || '';
        },
      },
      {
        platform: 'coursera',
        pattern: /coursera\.org\/.*\.vtt/,
      },
    ];
  }

  transformResponse(body: string, _contentType: string, _url: string): SubtitleCue[] {
    // Coursera subtitles are standard WebVTT
    return parseWebVTT(body);
  }
}
