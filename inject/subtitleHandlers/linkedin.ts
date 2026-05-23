import type { SubtitleCue, SubtitleUrlPattern } from '@/types/subtitle';
import type { SubtitleHandler } from './registry';
import { parseWebVTT } from '@/lib/subtitleParser';

export class LinkedInHandler implements SubtitleHandler {
  readonly platform = 'linkedin';

  detect(): boolean {
    return window.location.hostname.includes('linkedin.com');
  }

  getPatterns(): SubtitleUrlPattern[] {
    return [
      {
        platform: 'linkedin',
        // Matches VTT subtitle URLs on licdn.com or linkedin.com CDN domains
        pattern: /(licdn\.com|linkedin\.com)\/.*\.vtt/i,
        languageExtractor: (url) => {
          // 1. Check query parameters (e.g., ?lang=en, ?locale=en_US)
          const langParam = url.searchParams.get('lang') || url.searchParams.get('locale');
          if (langParam) return langParam;

          // 2. Check path segments (e.g., /en/, /en-US/, /en_US/)
          const pathParts = url.pathname.split('/');
          const langSegment = pathParts.find((p) => /^[a-z]{2}([-_][A-Z]{2})?$/i.test(p));
          if (langSegment) return langSegment.replace('_', '-');

          // 3. Check filename suffix (e.g., /subtitle_en.vtt, /subtitle-en_US.vtt)
          const filename = pathParts[pathParts.length - 1] || '';
          const fileMatch = filename.match(/[_-]([a-z]{2}([-_][A-Z]{2})?)\.vtt$/i);
          if (fileMatch) return fileMatch[1].replace('_', '-');

          return '';
        },
      },
    ];
  }

  transformResponse(body: string, _contentType: string, _url: string): SubtitleCue[] {
    // LinkedIn Learning subtitles are standard WebVTT format
    return parseWebVTT(body);
  }
}
