/**
 * Generic Subtitle Handler — lowest-priority fallback that intercepts and
 * translates subtitles on ANY website with a `<video>` element, without a
 * dedicated platform-specific handler.
 *
 * Mirrors Immersive Translate's `webvtt`/`subsrt`/`ebutt`/`general` handler
 * types: broad URL-pattern interception (`.vtt`/`.srt`/`.ttml` + caption path
 * keywords) plus a DOM cue-scraping fallback tier for sites that render
 * captions into the DOM. Format conversion is delegated to the shared
 * `parseSubtitles()` auto-detect parser; a content-validation guard rejects
 * non-subtitle VTT/XML payloads (chapter markers, app manifests).
 *
 * Priority: `detect()` returns `true` only when NO other registered handler
 * detects the current hostname, so platform-specific handlers (YouTube, Max,
 * Youku, …) always win. Register this handler LAST in both worlds.
 */

import type {
  SubtitleCue,
  SubtitleUrlPattern,
  AvailableSubtitleTrack,
  DomCueSource,
} from '@/types/subtitle';
import type { SubtitleHandler } from './registry';
import { getSubtitleHandlers } from './registry';
import { parseSubtitles, validateSubtitleContent } from '@/lib/subtitleParser';

/**
 * URL patterns for the generic handler. Extensions are matched at a word
 * boundary (optional query/fragment after the extension) to avoid catching
 * `.vttx` or `.xmlfoo`. `.xml` is intentionally NOT matched on extension
 * alone (too broad — app manifests, SVGs, config files); TTML is caught via
 * the `texttrack`/`ttml` path keywords or content-type instead.
 */
const GENERIC_URL_PATTERNS: SubtitleUrlPattern[] = [
  {
    platform: 'generic',
    // .vtt / .webvtt
    pattern: /\.(?:vtt|webvtt)(?:[?#]|$)/i,
    languageExtractor: extractLanguageFromUrl,
  },
  {
    platform: 'generic',
    // .srt
    pattern: /\.srt(?:[?#]|$)/i,
    languageExtractor: extractLanguageFromUrl,
  },
  {
    platform: 'generic',
    // .ttml / .ttml2 / .dfxp (TTML delivery format)
    pattern: /\.(?:ttml|ttml2|dfxp)(?:[?#]|$)/i,
    languageExtractor: extractLanguageFromUrl,
  },
  {
    platform: 'generic',
    // Caption/subtitle path keywords on otherwise extensionless URLs.
    pattern: /\/(?:subtitle|captions?|texttrack)s?\//i,
    languageExtractor: extractLanguageFromUrl,
  },
];

/**
 * Content-Type patterns the generic handler treats as subtitle payloads. Used
 * by the registry's secondary content-type matching path (URL patterns take
 * precedence). Lowercased, `;`-suffix trimmed by the registry before compare.
 */
const GENERIC_CONTENT_TYPE_PATTERNS: string[] = [
  'text/vtt',
  'application/x-subtitle', // generic subtitle mime
  'application/x-subrip', // .srt
  'text/srt',
  'application/ttml+xml', // .ttml
  'application/xml+ttml',
];

/**
 * Common native caption container selectors across video frameworks. Used both
 * for hiding native captions on the XHR/fetch path and as the DOM cue-scraping
 * fallback. Covers Video.js, Shaka, hls.js, jwplayer, and YouTube-style
 * renderers; the first one present on the page wins.
 */
const GENERIC_NATIVE_CAPTION_SELECTORS = [
  '.vjs-text-track-display', // Video.js
  '.shaka-text-container', // Shaka Player
  '[data-testid*="caption"]', // generic React testid convention
  '.jw-text-track-display', // JW Player
  '.ytp-caption-segment', // YouTube-style
  '.cue-text',
  '.subtitle-text',
  '#caption-window',
];

/** Caption-window selector for hiding the native overlay on the intercept path. */
const GENERIC_NATIVE_CAPTION_HIDE_SELECTOR = GENERIC_NATIVE_CAPTION_SELECTORS.join(', ');

/**
 * Try to derive a BCP-47-ish language code from a subtitle URL. Checks common
 * query params (`lang`/`language`/`locale`/`lc`) then a `xx-YY` token embedded
 * in the filename. Returns '' when nothing plausible is found (the coordinator
 * treats '' as "unknown — fall back to preferred").
 */
function extractLanguageFromUrl(url: URL): string {
  const fromQuery =
    url.searchParams.get('lang') ||
    url.searchParams.get('language') ||
    url.searchParams.get('locale') ||
    url.searchParams.get('lc') ||
    '';
  if (fromQuery) return fromQuery.replace(/_/g, '-').toLowerCase();

  // Filename-embedded language token, e.g. `subtitles_en.vtt`, `movie.fr.srt`.
  const file = url.pathname.split('/').pop() || '';
  const m = file.match(/[_.-]([a-z]{2,3})(?:[-_]([A-Za-z]{2,4}))?\.(?:vtt|webvtt|srt|ttml|ttml2|dfxp)$/i);
  if (m) {
    return m[2] ? `${m[1].toLowerCase()}-${m[2]}` : m[1].toLowerCase();
  }
  return '';
}

/**
 * Whether a `<video>` element currently exists on the page. Used as the
 * watch-page gate: the generic handler only auto-activates on real video pages,
 * not listing/search/home pages that may carry preview `<video>` thumbnails.
 *
 * `findPrimaryVideo` cannot be imported here (it pulls `readyState` filtering
 * which is too strict for the registration-time check). A plain
 * `getElementsByTagName('video')` covers detection; the scraper/overlay later
 * resolve the primary video via the shared helper.
 */
function hasVideoElement(): boolean {
  if (typeof document === 'undefined') return false;
  return document.getElementsByTagName('video').length > 0;
}

export class GenericSubtitleHandler implements SubtitleHandler {
  readonly platform = 'generic';

  /**
   * Activate as a LAST-RESORT fallback: return true only when no other
   * registered handler detects the current hostname. Platform-specific handlers
   * are registered before this one, so `getSubtitleHandlers()` already has
   * them; we skip any handler whose `platform` is not `'generic'`.
   *
   * This keeps YouTube/Max/Youku/etc. fully unaffected (their handlers win) and
   * ensures the generic URL patterns don't register on those hosts (which would
   * otherwise cause double interception via `getPatternsForCurrentHost()`).
   */
  detect(): boolean {
    // Skip any specific handler that detects the current host — they win.
    // Static import is safe: registry.ts imports only types from handlers (no
    // runtime cycle), so `getSubtitleHandlers` is available by the time
    // `detect()` runs at registration time.
    for (const handler of getSubtitleHandlers()) {
      if (handler.platform === 'generic') continue;
      if (handler.detect()) return false; // a specific handler owns this host
    }
    return true;
  }

  /**
   * Whether this is a real video watch page (vs. listing/search/home). The
   * generic handler gates auto-activate on the presence of a `<video>` element
   * so it doesn't fire on every arbitrary page (the registry is registered on
   * `<all_urls>`). The coordinator's `isOnWatchPage()` delegates here.
   */
  isWatchPage(): boolean {
    return hasVideoElement();
  }

  getPatterns(): SubtitleUrlPattern[] {
    return GENERIC_URL_PATTERNS;
  }

  /**
   * Content-Type patterns the registry should treat as subtitle payloads when
   * URL matching misses. The registry consults this as a secondary signal.
   */
  getContentTypePatterns(): string[] {
    return GENERIC_CONTENT_TYPE_PATTERNS;
  }

  /**
   * Parse an intercepted response into cues. Returns an empty array when the
   * body fails content validation (non-subtitle VTT/XML) so the coordinator's
   * always-respond path passes the original through untouched.
   */
  transformResponse(body: string, _contentType: string, _url: string): SubtitleCue[] {
    if (!validateSubtitleContent(body)) return [];
    return parseSubtitles(body);
  }

  /**
   * Extract available tracks from a URL that the generic handler intercepted.
   * For the generic handler the intercepted URL is itself the track URL; the
   * language (if any) comes from the pattern's languageExtractor.
   */
  extractAvailableTracks(
    _body: string,
    _contentType: string,
    url: string,
  ): AvailableSubtitleTrack[] {
    const parsed = new URL(url, window.location.origin);
    const language =
      GENERIC_URL_PATTERNS.find((p) => p.pattern.test(url))?.languageExtractor?.(parsed) || '';
    return [
      {
        language,
        label: language || 'subtitle',
        url,
        isAutoGenerated: false,
        platform: 'generic',
      },
    ];
  }

  /** Hide common native caption containers while the bilingual overlay is active. */
  getNativeCaptionHide(): { selector: string; method: 'display' | 'visibility' } {
    return { selector: GENERIC_NATIVE_CAPTION_HIDE_SELECTOR, method: 'display' };
  }

  /**
   * DOM cue-scraping fallback for sites that render captions into the DOM
   * without exposing a subtitle URL (no intercepted VTT/SRT/TTML). The
   * coordinator's DOM branch hides the native caption window and samples
   * `video.currentTime` to derive cue timing.
   *
   * Selectors target the union of common framework caption containers; the
   * scraper re-resolves the cue selector on each MutationObserver fire, so the
   * first container present on the page is used automatically.
   */
  getDomCueSource(): DomCueSource {
    return {
      // Cue text = aggregated textContent of the first present caption container.
      cueSelector: GENERIC_NATIVE_CAPTION_SELECTORS.join(', '),
      // The native caption window to hide. Same union; display:none is safe here
      // because the cue source is observed via textContent snapshots, not via
      // the rendered geometry (unlike Youku whose cue source IS the hide target).
      captionWindowSelector: GENERIC_NATIVE_CAPTION_HIDE_SELECTOR,
      // Observe documentElement — generic sites have no single stable player
      // root we can rely on, and the scraper re-attaches when the caption node
      // appears (deferred-attach for late-mounting SPA players).
      observeRootSelector: 'body',
      // Generic sites rarely expose an active-language signal; return '' so the
      // coordinator treats the language as unknown and falls back to the
      // user's preferred language setting.
      readActiveLanguage: () => '',
      // No reliable track-switch selector across arbitrary frameworks; omit so
      // track-switch buffer-reset detection is skipped (cue text still updates
      // via the main observer).
      captionHideMethod: 'display',
    };
  }
}
