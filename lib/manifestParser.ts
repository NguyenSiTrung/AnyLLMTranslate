/**
 * Manifest parsers for HLS (.m3u8) and DASH (.mpd) streaming manifests.
 *
 * All functions are pure, side-effect-free, and deterministic — no network
 * calls. They extract subtitle track URLs from streaming manifests so the
 * coordinator can fetch the full subtitle track upfront (Tier 2 access).
 */

/** Parsed HLS subtitle track from a multivariant playlist */
export interface HlsSubtitleTrack {
  url: string;
  language: string;
  label: string;
  isDefault: boolean;
}

/** Parsed HLS subtitle segment from a media playlist */
export interface HlsSubtitleSegment {
  url: string;
  duration: number;
}

/** Parsed DASH subtitle track */
export interface DashSubtitleTrack {
  url: string;
  language: string;
}

/**
 * Parse an HLS multivariant (master) playlist and extract subtitle track
 * entries from `#EXT-X-MEDIA: TYPE=SUBTITLES` lines.
 *
 * Resolves relative URIs against the provided `baseUrl`.
 */
export function parseHlsManifest(body: string, baseUrl: string): HlsSubtitleTrack[] {
  if (!body) return [];

  const tracks: HlsSubtitleTrack[] = [];
  const lines = body.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#EXT-X-MEDIA:')) continue;

    const attrs = parseHlsAttributes(trimmed.slice('#EXT-X-MEDIA:'.length));
    if (attrs['TYPE']?.toUpperCase() !== 'SUBTITLES') continue;

    const uri = attrs['URI'];
    if (!uri) continue;

    tracks.push({
      url: resolveUrl(uri, baseUrl),
      language: attrs['LANGUAGE'] ?? '',
      label: attrs['NAME'] ?? attrs['LANGUAGE'] ?? '',
      isDefault: attrs['DEFAULT']?.toUpperCase() === 'YES',
    });
  }

  return tracks;
}

/**
 * Parse an HLS subtitle media playlist and extract segment URLs from
 * `#EXTINF` + following URL lines.
 *
 * Handles `#EXT-X-MAP` (init segments are not returned as media segments).
 * Resolves relative URIs against the provided `baseUrl`.
 */
export function parseHlsSubtitlePlaylist(body: string, baseUrl: string): HlsSubtitleSegment[] {
  if (!body) return [];

  const segments: HlsSubtitleSegment[] = [];
  const lines = body.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // EXTINF line is followed by the segment URL on the next non-comment line
    if (trimmed.startsWith('#EXTINF:')) {
      const durationMatch = trimmed.match(/^#EXTINF:([\d.]+)/);
      const duration = durationMatch ? parseFloat(durationMatch[1]) : 0;

      // Find the next non-comment, non-empty line — that's the segment URL
      for (let j = i + 1; j < lines.length; j++) {
        const nextTrimmed = lines[j].trim();
        if (!nextTrimmed || nextTrimmed.startsWith('#')) continue;

        segments.push({
          url: resolveUrl(nextTrimmed, baseUrl),
          duration,
        });
        i = j; // Skip past the URL line
        break;
      }
    }
  }

  return segments;
}

/**
 * Parse a DASH (.mpd) manifest (XML) and extract subtitle track URLs from
 * AdaptationSets with text/vtt or application/mp4 mimeType.
 *
 * Uses DOMParser for XML parsing. Invalid XML returns `[]`.
 * Resolves relative BaseURLs against the provided `baseUrl`.
 */
export function parseDashManifest(body: string, baseUrl: string): DashSubtitleTrack[] {
  if (!body) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(body, 'application/xml');

  // Check for parse error
  const parserError = doc.querySelector('parsererror');
  if (parserError) return [];

  const tracks: DashSubtitleTrack[] = [];

  const adaptationSets = doc.querySelectorAll('AdaptationSet');
  for (const adaptationSet of Array.from(adaptationSets)) {
    const mimeType = adaptationSet.getAttribute('mimeType') ?? '';

    // Only text/vtt or application/mp4 with text content are subtitle tracks
    const isTextVtt = mimeType.toLowerCase() === 'text/vtt';
    const isAppMp4 = mimeType.toLowerCase() === 'application/mp4';

    // Check for Role element with caption/subtitle value
    const roleEl = adaptationSet.querySelector('Role');
    const roleValue = roleEl?.getAttribute('value')?.toLowerCase() ?? '';
    const hasSubtitleRole = roleValue === 'caption' || roleValue === 'subtitle';

    // application/mp4 needs additional signal (contentType=text or Role) to be subtitles
    if (!isTextVtt && !(isAppMp4 && (hasSubtitleRole || (adaptationSet.getAttribute('contentType') ?? '').toLowerCase() === 'text'))) {
      continue;
    }

    const lang = adaptationSet.getAttribute('lang') ?? '';

    const representations = adaptationSet.querySelectorAll('Representation');
    for (const rep of Array.from(representations)) {
      // Try BaseURL first
      const baseUrlEl = rep.querySelector('BaseURL');
      let url: string | null = null;

      if (baseUrlEl && baseUrlEl.textContent) {
        url = baseUrlEl.textContent.trim();
      }

      // Try SegmentTemplate if no BaseURL
      if (!url) {
        const segmentTemplate = rep.querySelector('SegmentTemplate');
        if (segmentTemplate) {
          const media = segmentTemplate.getAttribute('media');
          if (media) {
            // Replace $Number$ with the start number (or 1)
            const startNumber = segmentTemplate.getAttribute('startNumber') ?? '1';
            url = media.replace(/\$Number\$/, startNumber);
          }
        }
      }

      if (!url) continue;

      tracks.push({
        url: resolveUrl(url, baseUrl),
        language: lang,
      });
    }
  }

  return tracks;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse key=value attributes from an HLS tag (e.g. EXT-X-MEDIA).
 * Handles both quoted ("value") and unquoted (value) attribute values.
 */
function parseHlsAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Match KEY=VALUE where VALUE can be "quoted" or unquoted (until next comma)
  const regex = /([A-Z0-9-]+)=(?:"([^"]*)"|([^,]*))/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(attrString)) !== null) {
    attrs[match[1].toUpperCase()] = match[2] ?? match[3] ?? '';
  }
  return attrs;
}

/**
 * Resolve a possibly-relative URL against a base URL.
 * Handles absolute, protocol-relative (//), and path-relative URLs.
 */
function resolveUrl(url: string, baseUrl: string): string {
  // Already absolute
  if (/^https?:\/\//i.test(url)) return url;

  // Protocol-relative
  if (url.startsWith('//')) {
    try {
      const base = new URL(baseUrl);
      return `${base.protocol}${url}`;
    } catch {
      return url;
    }
  }

  // Relative — resolve against baseUrl
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}
