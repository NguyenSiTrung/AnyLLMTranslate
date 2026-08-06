import type { SubtitleCue, SubtitleUrlPattern, AvailableSubtitleTrack } from '@/types/subtitle';
import type { SubtitleHandler } from './registry';
import { parseWebVTT } from '@/lib/subtitleParser';

/**
 * Raw transcript container extracted from a LinkedIn Learning
 * `learning-api/detailedCourses` JSON payload.
 */
interface TranscriptContainer {
  /** Raw transcript lines (`{ transcriptStartAt: ms, caption: string }`) */
  lines: unknown[];
  /** Video duration in seconds, when present */
  durationInSeconds?: number;
  /** Primary transcript language (BCP-47-ish), when present */
  language: string;
}

/**
 * Walk the accepted detailedCourses response shapes to find the transcript:
 * - `{ elements: [{ selectedVideo: { transcript: { lines } } }] }`
 * - `{ selectedVideo: { transcript: { lines } } }`
 * - `{ transcript: { lines } }`
 * Returns null when the body is not JSON or carries no transcript.
 */
function extractTranscriptContainer(body: string): TranscriptContainer | null {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const root = data as Record<string, unknown>;
  const elements = Array.isArray(root.elements) ? (root.elements as unknown[]) : [];
  const firstElement = (elements[0] as Record<string, unknown> | undefined) ?? {};
  const selectedVideo =
    (firstElement.selectedVideo as Record<string, unknown> | undefined) ??
    (root.selectedVideo as Record<string, unknown> | undefined) ??
    {};
  const transcript =
    (selectedVideo.transcript as Record<string, unknown> | undefined) ??
    (root.transcript as Record<string, unknown> | undefined);
  const lines = transcript?.lines;
  if (!Array.isArray(lines)) return null;

  const primaryLocale = selectedVideo.primaryLocale as Record<string, unknown> | undefined;
  const language = typeof primaryLocale?.language === 'string' ? primaryLocale.language : '';
  return {
    lines,
    durationInSeconds:
      typeof selectedVideo.durationInSeconds === 'number'
        ? (selectedVideo.durationInSeconds as number)
        : undefined,
    language,
  };
}

/**
 * Parse LinkedIn Learning's transcript JSON into normalized cues.
 *
 * The player and transcript panel both consume the Voyager API payload
 * `learning-api/detailedCourses`, whose `selectedVideo.transcript.lines` array
 * carries `{ transcriptStartAt (ms), caption }` entries. No `.vtt` file is
 * ever fetched by the player, so this is the only reliable caption source.
 */
export function parseLinkedInTranscriptJson(body: string): SubtitleCue[] {
  const container = extractTranscriptContainer(body);
  if (!container) return [];

  const cues: SubtitleCue[] = [];
  for (const line of container.lines) {
    if (!line || typeof line !== 'object') continue;
    const entry = line as Record<string, unknown>;
    const caption = typeof entry.caption === 'string' ? entry.caption.trim() : '';
    if (!caption) continue;
    const startMs = typeof entry.transcriptStartAt === 'number' ? entry.transcriptStartAt : NaN;
    if (Number.isNaN(startMs)) continue;
    cues.push({ startTime: startMs / 1000, endTime: 0, text: caption });
  }

  // End of each cue = start of the next; last cue ends at the video duration
  // (fallback: 2s after its own start, mirroring yt-dlp's SRT conversion).
  for (let i = 0; i < cues.length; i++) {
    cues[i].endTime = cues[i + 1]?.startTime ?? container.durationInSeconds ?? cues[i].startTime + 2;
  }
  return cues;
}

export class LinkedInHandler implements SubtitleHandler {
  readonly platform = 'linkedin';

  detect(): boolean {
    return window.location.hostname.includes('linkedin.com');
  }

  isWatchPage(): boolean {
    return window.location.pathname.includes('/learning/');
  }

  getPatterns(): SubtitleUrlPattern[] {
    return [
      {
        platform: 'linkedin',
        // LinkedIn Learning delivers captions as transcript lines inside the
        // detailedCourses JSON API (selectedVideo.transcript.lines) — the
        // video.js player never fetches a .vtt. Intercepted as a subtitle
        // payload; the coordinator passes the original JSON back to the page
        // and renders the translation via the overlay.
        pattern: /linkedin\.com\/learning-api\/detailedCourses/i,
      },
      {
        platform: 'linkedin',
        // Captions are served from LinkedIn's ambry blob endpoint — the
        // player element's data-captions-url (e.g.
        // https://www.linkedin.com/ambry/?x-li-ambry-ep=…). No .vtt
        // extension, so match the path; the response is text/vtt.
        pattern: /linkedin\.com\/ambry\//i,
      },
      {
        platform: 'linkedin',
        // Matches VTT subtitle URLs on licdn.com or linkedin.com CDN domains
        // (legacy — kept for any direct .vtt delivery).
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

  transformResponse(body: string, contentType: string, _url: string): SubtitleCue[] {
    // detailedCourses returns JSON; detect by content-type OR body prefix so a
    // missing/odd Content-Type header can't silently drop the transcript.
    if (
      /json/i.test(contentType) ||
      body.trimStart().startsWith('{') ||
      body.trimStart().startsWith('[')
    ) {
      return parseLinkedInTranscriptJson(body);
    }
    // Legacy path: direct WebVTT subtitles.
    return parseWebVTT(body);
  }

  getMetadataPatterns(): SubtitleUrlPattern[] {
    return [
      {
        // Matches LinkedIn Learning's video/transcript API endpoints
        platform: 'linkedin',
        pattern: /linkedin\.com\/api\/.*(?:transcript|caption|subtitle)/i,
      },
    ];
  }

  extractAvailableTracks(body: string, _contentType: string, _url: string): AvailableSubtitleTrack[] {
    try {
      const data = JSON.parse(body);
      const tracks: AvailableSubtitleTrack[] = [];

      // LinkedIn may return tracks in various shapes
      const subtitles = data?.subtitles || data?.captions || data?.transcripts || [];
      const subtitleList = Array.isArray(subtitles) ? subtitles : Object.values(subtitles);

      for (const item of subtitleList) {
        const c = item as Record<string, unknown>;
        const lang = (c.language as string) || (c.locale as string) || (c.lang as string) || '';
        if (!lang) continue;
        tracks.push({
          language: lang,
          label: (c.label as string) || lang,
          url: (c.url as string) || undefined,
          isAutoGenerated: false,
          platform: 'linkedin',
        });
      }

      if (tracks.length > 0) return tracks;

      // detailedCourses transcript payload: expose the video's transcript as a
      // track (no direct URL — captions travel inside the JSON itself).
      const container = extractTranscriptContainer(body);
      if (container && container.lines.length > 0) {
        const language = container.language || 'en';
        tracks.push({
          language,
          label: language,
          isAutoGenerated: false,
          platform: 'linkedin',
        });
      }

      return tracks;
    } catch {
      return [];
    }
  }

  /** Hide video.js's emulated caption window while the overlay is active. */
  getNativeCaptionHide(): { selector: string; method?: 'display' | 'visibility' } {
    return { selector: '.vjs-text-track-display' };
  }
}
