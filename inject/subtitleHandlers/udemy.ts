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
          console.log('AnyLLMTranslate: Udemy language extractor', {
            url: url.href,
            pathParts,
            extractedLanguage: langMatch || '',
          });
          return langMatch || '';
        },
      },
    ];
  }

  transformResponse(body: string, _contentType: string, _url: string): SubtitleCue[] {
    // Udemy subtitles are standard WebVTT
    const cues = parseWebVTT(body);

    // Cue-level filtering: remove ONLY cues that are pure sprite metadata
    // Sprite metadata is very short (typically < 100 chars) and matches the pattern exactly
    const filteredCues = cues.filter((cue) => {
      const text = cue.text.trim();

      // Only filter if the text is short AND matches sprite pattern
      // This prevents false positives on legitimate subtitles discussing image files
      if (text.length > 100) {
        return true; // Keep long subtitles (they're not sprite metadata)
      }

      // Check for sprite-specific pattern: image file with #xywh= coordinates
      // Must be the entire text, not just contained within
      const spritePattern = /^(.+)\.(jpg|png|jpeg|webp|gif)(#xywh=.+)?$/i;
      return !spritePattern.test(text);
    });

    // Early-exit heuristic: if ALL cues were filtered out (pure sprite track), return empty array
    // This is an optimization to avoid processing pure sprite metadata tracks
    if (filteredCues.length === 0 && cues.length > 0) {
      return [];
    }

    return filteredCues;
  }
}
