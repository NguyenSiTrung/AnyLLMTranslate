/**
 * Max (HBO Max) DASH MPD subtitle extraction utilities.
 *
 * Pure parsing helpers plus async fetch/parse for subtitle track files.
 * Used by fetch/XHR interceptors to discover TTML subtitle tracks in .mpd manifests.
 */

import { parseSubtitles } from '@/lib/subtitleParser';
import { parseTTML } from '@/lib/ttmlParser';

/** Normalized subtitle cue for Max MPD pipeline (console logging / future overlay). */
export interface ParsedSubtitleCue {
  start: number;
  end: number;
  text: string;
}

/** Subtitle track discovered inside a DASH MPD manifest. */
export interface MpdSubtitleTrack {
  url: string;
  language: string;
  mimeType?: string;
}

/** Returns true when the URL points to a DASH manifest (.mpd). */
export function detectMpdRequests(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase().split('?')[0].split('#')[0];
  return lower.endsWith('.mpd');
}

/**
 * Parse MPD manifest XML text into a Document.
 * Returns null when the XML is invalid.
 */
export function parseMpd(mpdText: string, _baseUrl: string): Document | null {
  if (!mpdText) return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(mpdText, 'application/xml');
  if (doc.querySelector('parsererror')) return null;
  return doc;
}

/**
 * Extract subtitle track URLs from a parsed MPD document.
 * Matches AdaptationSets with mimeType containing "ttml", contentType="text",
 * text/vtt, or application/mp4 subtitle roles.
 */
export function extractSubtitleTracks(mpdXml: Document, baseUrl: string): MpdSubtitleTrack[] {
  const tracks: MpdSubtitleTrack[] = [];
  const adaptationSets = mpdXml.querySelectorAll('AdaptationSet');

  for (const adaptationSet of Array.from(adaptationSets)) {
    if (!isSubtitleAdaptationSet(adaptationSet)) continue;

    const lang = adaptationSet.getAttribute('lang') ?? '';
    const mimeType = adaptationSet.getAttribute('mimeType') ?? undefined;
    const representations = adaptationSet.querySelectorAll('Representation');

    for (const rep of Array.from(representations)) {
      const url = extractRepresentationUrl(rep, adaptationSet, baseUrl);
      if (!url) continue;
      tracks.push({ url, language: lang, mimeType });
    }
  }

  return tracks;
}

/**
 * Fetch a subtitle file and parse timed cues.
 * Supports WebVTT, SRT, and TTML / IMSC1.
 */
export async function fetchAndParseSubtitle(url: string): Promise<ParsedSubtitleCue[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Subtitle fetch failed: HTTP ${response.status}`);
  }

  const body = await response.text();
  const cues = parseSubtitleContent(body, response.headers.get('Content-Type') ?? '', url);

  return cues.map((cue) => ({
    start: cue.startTime,
    end: cue.endTime,
    text: cue.text,
  }));
}

/** Parse subtitle body text into cues (VTT, SRT, or TTML). */
export function parseSubtitleContent(
  body: string,
  contentType: string,
  url: string,
): { startTime: number; endTime: number; text: string }[] {
  const ct = contentType.toLowerCase();
  const lowerUrl = url.toLowerCase().split('?')[0];

  const isTtml =
    ct.includes('ttml') ||
    lowerUrl.endsWith('.ttml') ||
    lowerUrl.endsWith('.xml') ||
    body.includes('<tt ') ||
    body.includes('<tt>') ||
    body.includes('xmlns="http://www.w3.org/ns/ttml"');

  if (isTtml) {
    return parseTTML(body);
  }

  return parseSubtitles(body);
}

function isSubtitleAdaptationSet(adaptationSet: Element): boolean {
  const mimeType = (adaptationSet.getAttribute('mimeType') ?? '').toLowerCase();
  const contentType = (adaptationSet.getAttribute('contentType') ?? '').toLowerCase();

  if (mimeType.includes('ttml')) return true;
  if (contentType === 'text') return true;
  if (mimeType === 'text/vtt') return true;

  const roleEl = adaptationSet.querySelector('Role');
  const roleValue = roleEl?.getAttribute('value')?.toLowerCase() ?? '';
  const hasSubtitleRole = roleValue === 'caption' || roleValue === 'subtitle';

  if (mimeType === 'application/mp4' && (hasSubtitleRole || contentType === 'text')) {
    return true;
  }

  return hasSubtitleRole && mimeType !== 'video/mp4' && mimeType !== 'audio/mp4';
}

function extractRepresentationUrl(
  rep: Element,
  adaptationSet: Element,
  baseUrl: string,
): string | null {
  const baseUrlEl = rep.querySelector('BaseURL');
  if (baseUrlEl?.textContent?.trim()) {
    return resolveUrl(baseUrlEl.textContent.trim(), mpdResolveBase(baseUrl));
  }

  const segmentTemplate =
    rep.querySelector('SegmentTemplate') ?? adaptationSet.querySelector('SegmentTemplate');
  if (segmentTemplate) {
    const media = segmentTemplate.getAttribute('media');
    if (media) {
      const startNumber = segmentTemplate.getAttribute('startNumber') ?? '1';
      const representationId = rep.getAttribute('id') ?? '';
      const bandwidth = rep.getAttribute('bandwidth') ?? '';
      const url = media
        .replace(/\$RepresentationID\$/g, representationId)
        .replace(/\$Bandwidth\$/g, bandwidth)
        .replace(/\$Number\$/g, startNumber);
      return resolveUrl(url, mpdResolveBase(baseUrl));
    }
  }

  return null;
}

/** MPD-relative URL base (directory containing the .mpd file, without query). */
function mpdResolveBase(mpdUrl: string): string {
  try {
    const url = new URL(mpdUrl);
    url.search = '';
    url.hash = '';
    const slash = url.pathname.lastIndexOf('/');
    if (slash >= 0) {
      url.pathname = url.pathname.slice(0, slash + 1);
    }
    return url.href;
  } catch {
    return mpdUrl;
  }
}

function resolveUrl(url: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(url)) return url;

  if (url.startsWith('//')) {
    try {
      const base = new URL(baseUrl);
      return `${base.protocol}${url}`;
    } catch {
      return url;
    }
  }

  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}