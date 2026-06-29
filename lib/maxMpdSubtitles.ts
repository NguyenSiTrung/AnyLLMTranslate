/**
 * Max (HBO Max) DASH MPD subtitle extraction utilities.
 *
 * Pure parsing helpers plus async fetch/parse for subtitle track files.
 * Used by fetch/XHR interceptors to discover TTML subtitle tracks in .mpd manifests.
 */

import { parseSubtitles } from '@/lib/subtitleParser';
import { parseTTML } from '@/lib/ttmlParser';
import { concatVttSegments } from '@/lib/vttSegmentConcat';

/** Normalized subtitle cue for Max MPD pipeline (console logging / future overlay). */
export interface ParsedSubtitleCue {
  start: number;
  end: number;
  text: string;
}

/** Template for progressively fetching numbered WebVTT segments. */
export interface SegmentFetchTemplate {
  media: string;
  startNumber: number;
  representationId: string;
  bandwidth: string;
  mpdUrl: string;
  adaptationBaseUrl?: string;
}

/** Subtitle track discovered inside a DASH MPD manifest. */
export interface MpdSubtitleTrack {
  /** First segment URL, or the sole subtitle file URL. */
  url: string;
  /** All segment URLs when the track uses SegmentTemplate + SegmentTimeline. */
  segmentUrls?: string[];
  /** Progressive numbered-segment fetch when total count is unknown. */
  segmentFetch?: SegmentFetchTemplate;
  language: string;
  mimeType?: string;
}

export interface FetchAndParseSubtitleOptions {
  segmentUrls?: string[];
  segmentFetch?: SegmentFetchTemplate;
}

/** Safety cap for segmented WebVTT fetches (HBO Max can list thousands of segments). */
const MAX_SEGMENT_FETCH_COUNT = 3000;

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

    const representations = adaptationSet.querySelectorAll('Representation');

    for (const rep of Array.from(representations)) {
      const lang =
        adaptationSet.getAttribute('lang') ??
        rep.getAttribute('lang') ??
        '';
      const mimeType =
        adaptationSet.getAttribute('mimeType') ??
        rep.getAttribute('mimeType') ??
        undefined;

      const built = buildRepresentationSegmentUrls(rep, adaptationSet, baseUrl, mpdXml);
      if (!built || built.urls.length === 0) continue;

      tracks.push({
        url: built.urls[0],
        segmentUrls: built.urls.length > 1 ? built.urls : undefined,
        segmentFetch: built.segmentFetch,
        language: lang,
        mimeType,
      });
    }
  }

  return tracks;
}

/**
 * Fetch a subtitle file (or segmented WebVTT track) and parse timed cues.
 * Supports WebVTT, SRT, and TTML / IMSC1.
 */
export async function fetchAndParseSubtitle(
  url: string,
  options?: string[] | FetchAndParseSubtitleOptions,
): Promise<ParsedSubtitleCue[]> {
  const resolvedOptions: FetchAndParseSubtitleOptions = Array.isArray(options)
    ? { segmentUrls: options }
    : (options ?? {});

  let bodies: string[] = [];
  let contentType = '';

  if (resolvedOptions.segmentFetch) {
    bodies = await fetchSegmentBodiesProgressively(resolvedOptions.segmentFetch);
  } else {
    const urls =
      resolvedOptions.segmentUrls && resolvedOptions.segmentUrls.length > 0
        ? resolvedOptions.segmentUrls
        : [url];

    for (const segmentUrl of urls) {
      const response = await fetch(segmentUrl);
      if (!response.ok) {
        throw new Error(`Subtitle fetch failed: HTTP ${response.status}`);
      }
      const text = await response.text();
      if (isMpdManifestBody(text)) {
        throw new Error('Subtitle fetch returned MPD manifest instead of subtitle content');
      }
      bodies.push(text);
      if (!contentType) {
        contentType = response.headers.get('Content-Type') ?? '';
      }
    }
  }

  if (bodies.length === 0) {
    return [];
  }

  const body = bodies.length > 1 ? concatVttSegments(bodies) : bodies[0];
  const cues = parseSubtitleContent(body, contentType, url);

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
  if (isMpdManifestBody(body)) {
    return [];
  }

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

interface BuiltRepresentationSegments {
  urls: string[];
  segmentFetch?: SegmentFetchTemplate;
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

  if (hasSubtitleRole && mimeType !== 'video/mp4' && mimeType !== 'audio/mp4') {
    return true;
  }

  for (const rep of Array.from(adaptationSet.querySelectorAll('Representation'))) {
    const repMime = (rep.getAttribute('mimeType') ?? '').toLowerCase();
    if (repMime === 'text/vtt' || repMime.includes('ttml')) return true;
  }

  return false;
}

function buildRepresentationSegmentUrls(
  rep: Element,
  adaptationSet: Element,
  baseUrl: string,
  mpdXml: Document,
): BuiltRepresentationSegments | null {
  const adaptationBaseUrl = getDirectChildBaseUrl(adaptationSet);

  const baseUrlEl = rep.querySelector('BaseURL');
  if (baseUrlEl?.textContent?.trim()) {
    const resolved = resolveSubtitleUrl(
      joinMediaPaths(adaptationBaseUrl, baseUrlEl.textContent.trim()),
      baseUrl,
    );
    if (!resolved || isSelfReferentialSubtitleUrl(resolved, baseUrl)) return null;
    return { urls: [resolved] };
  }

  const segmentListUrls = buildSegmentListUrls(rep, adaptationSet, baseUrl, adaptationBaseUrl);
  if (segmentListUrls) {
    return { urls: segmentListUrls };
  }

  const segmentTemplate =
    rep.querySelector('SegmentTemplate') ?? adaptationSet.querySelector('SegmentTemplate');
  if (!segmentTemplate) return null;

  const media = segmentTemplate.getAttribute('media');
  if (!media) return null;

  const templateContext = createTemplateContext(
    segmentTemplate,
    rep,
    adaptationSet,
    baseUrl,
    adaptationBaseUrl,
  );
  const segmentCount = resolveSegmentCount(segmentTemplate, mpdXml);

  if (segmentCount === null) {
    const firstUrl = buildTemplatedSegmentUrl(templateContext, templateContext.startNumber);
    if (!firstUrl || isSelfReferentialSubtitleUrl(firstUrl, baseUrl)) return null;
    return {
      urls: [firstUrl],
      segmentFetch: {
        media: templateContext.media,
        startNumber: templateContext.startNumber,
        representationId: templateContext.representationId,
        bandwidth: templateContext.bandwidth,
        mpdUrl: baseUrl,
        adaptationBaseUrl: templateContext.adaptationBaseUrl,
      },
    };
  }

  const urls: string[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const resolved = buildTemplatedSegmentUrl(templateContext, templateContext.startNumber + i);
    if (!resolved || isSelfReferentialSubtitleUrl(resolved, baseUrl)) continue;
    urls.push(resolved);
  }

  return urls.length > 0 ? { urls } : null;
}

interface TemplateContext {
  media: string;
  startNumber: number;
  representationId: string;
  bandwidth: string;
  mpdUrl: string;
  adaptationBaseUrl?: string;
}

function createTemplateContext(
  segmentTemplate: Element,
  rep: Element,
  adaptationSet: Element,
  mpdUrl: string,
  adaptationBaseUrl?: string,
): TemplateContext {
  return {
    media: segmentTemplate.getAttribute('media') ?? '',
    startNumber: parseInt(segmentTemplate.getAttribute('startNumber') ?? '1', 10),
    representationId: rep.getAttribute('id') ?? '',
    bandwidth: rep.getAttribute('bandwidth') ?? '',
    mpdUrl,
    adaptationBaseUrl: adaptationBaseUrl ?? getDirectChildBaseUrl(adaptationSet),
  };
}

function buildTemplatedSegmentUrl(context: TemplateContext, number: number): string | null {
  const mediaPath = applySegmentTemplate(context.media, context, number);
  return resolveSubtitleUrl(joinMediaPaths(context.adaptationBaseUrl, mediaPath), context.mpdUrl);
}

function applySegmentTemplate(media: string, context: TemplateContext, number: number): string {
  return media
    .replace(/\$RepresentationID\$/g, context.representationId)
    .replace(/\$Bandwidth\$/g, context.bandwidth)
    .replace(/\$Number\$/g, String(number));
}

function buildSegmentListUrls(
  rep: Element,
  adaptationSet: Element,
  baseUrl: string,
  adaptationBaseUrl?: string,
): string[] | null {
  const segmentList =
    rep.querySelector('SegmentList') ?? adaptationSet.querySelector('SegmentList');
  if (!segmentList) return null;

  const urls: string[] = [];
  for (const segmentUrlEl of Array.from(segmentList.querySelectorAll('SegmentURL'))) {
    const media = segmentUrlEl.getAttribute('media');
    if (!media) continue;
    const resolved = resolveSubtitleUrl(joinMediaPaths(adaptationBaseUrl, media), baseUrl);
    if (!resolved || isSelfReferentialSubtitleUrl(resolved, baseUrl)) continue;
    urls.push(resolved);
  }

  return urls.length > 0 ? urls : null;
}

/** Returns segment count, or null when progressive fetch is required. */
function resolveSegmentCount(segmentTemplate: Element, mpdXml: Document): number | null {
  const timelineCount = countSegmentsFromTimeline(segmentTemplate);
  if (timelineCount > 1) {
    return Math.min(timelineCount, MAX_SEGMENT_FETCH_COUNT);
  }

  const durationAttr = segmentTemplate.getAttribute('duration');
  if (durationAttr) {
    const timescale = parseInt(segmentTemplate.getAttribute('timescale') ?? '1', 10);
    const segmentDurationSec = parseInt(durationAttr, 10) / timescale;
    const presentationDuration = getPresentationDuration(mpdXml);
    if (presentationDuration && segmentDurationSec > 0) {
      return Math.min(
        Math.ceil(presentationDuration / segmentDurationSec),
        MAX_SEGMENT_FETCH_COUNT,
      );
    }
  }

  if (timelineCount === 1) {
    return 1;
  }

  return null;
}

/** Count DASH segments declared in a SegmentTimeline (r attribute = repeat count). */
function countSegmentsFromTimeline(segmentTemplate: Element): number {
  const timeline = findChildByLocalName(segmentTemplate, 'SegmentTimeline');
  if (!timeline) return 0;

  let count = 0;
  for (const s of findChildrenByLocalName(timeline, 'S')) {
    const repeat = parseInt(s.getAttribute('r') ?? '0', 10);
    if (!Number.isFinite(repeat) || repeat < 0) continue;
    count += repeat + 1;
  }

  return count;
}

function getPresentationDuration(mpdXml: Document): number | null {
  const mpd = mpdXml.documentElement;
  const mpdDuration = parseIso8601Duration(mpd.getAttribute('mediaPresentationDuration'));
  if (mpdDuration) return mpdDuration;

  for (const period of Array.from(mpd.querySelectorAll('Period'))) {
    const periodDuration = parseIso8601Duration(period.getAttribute('duration'));
    if (periodDuration) return periodDuration;
  }

  return null;
}

function parseIso8601Duration(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/i);
  if (!match) return null;

  const hours = parseFloat(match[1] ?? '0');
  const minutes = parseFloat(match[2] ?? '0');
  const seconds = parseFloat(match[3] ?? '0');
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) && total > 0 ? total : null;
}

function getDirectChildBaseUrl(element: Element): string | undefined {
  for (const child of Array.from(element.children)) {
    if (child.localName === 'BaseURL') {
      const value = child.textContent?.trim();
      if (value) return value;
    }
  }
  return undefined;
}

function joinMediaPaths(prefix: string | undefined, media: string): string {
  if (!prefix) return media;
  if (/^https?:\/\//i.test(media)) return media;
  const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
  const normalizedMedia = media.startsWith('/') ? media.slice(1) : media;
  return `${normalizedPrefix}${normalizedMedia}`;
}

async function fetchSegmentBodiesProgressively(
  template: SegmentFetchTemplate,
): Promise<string[]> {
  const bodies: string[] = [];
  const context: TemplateContext = {
    media: template.media,
    startNumber: template.startNumber,
    representationId: template.representationId,
    bandwidth: template.bandwidth,
    mpdUrl: template.mpdUrl,
    adaptationBaseUrl: template.adaptationBaseUrl,
  };

  for (let i = 0; i < MAX_SEGMENT_FETCH_COUNT; i++) {
    const segmentUrl = buildTemplatedSegmentUrl(context, template.startNumber + i);
    if (!segmentUrl) break;

    const response = await fetch(segmentUrl);
    if (!response.ok) break;

    const text = await response.text();
    if (isMpdManifestBody(text)) break;

    bodies.push(text);
  }

  return bodies;
}

function isMpdManifestBody(body: string): boolean {
  const trimmed = body.trimStart();
  return trimmed.includes('<MPD') && trimmed.includes('urn:mpeg:dash:schema:mpd');
}

function isSelfReferentialSubtitleUrl(trackUrl: string, mpdUrl: string): boolean {
  try {
    const track = new URL(trackUrl);
    const mpd = new URL(mpdUrl);

    // Normalize pathnames by removing trailing slashes
    const trackPath = track.pathname.replace(/\/$/, '');
    const mpdPath = mpd.pathname.replace(/\/$/, '');

    // If they resolve to the same path (ignoring trailing slash and query params)
    if (track.origin === mpd.origin && trackPath === mpdPath) {
      return true;
    }

    // A subtitle track URL should not point to the root path
    if (track.pathname === '/' || track.pathname === '') {
      return true;
    }

    // A subtitle track URL should not point to a manifest file (.mpd or .m3u8)
    const lowerPath = trackPath.toLowerCase();
    if (lowerPath.endsWith('.mpd') || lowerPath.endsWith('.m3u8')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function findChildByLocalName(parent: Element, localName: string): Element | null {
  for (const child of Array.from(parent.children)) {
    if (child.localName === localName) return child;
  }
  return null;
}

function findChildrenByLocalName(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === localName);
}

/**
 * Resolve a subtitle segment URL against the MPD URL. Per RFC 3986, a relative
 * reference with its own path component REPLACES the base URL's query string
 * instead of inheriting it. Max's CDN carries its auth token
 * (`manifest-params=...`) in the MPD's query string and requires it on every
 * segment request — so without re-attaching it, resolved subtitle URLs 404.
 */
function resolveSubtitleUrl(mediaUrl: string, mpdUrl: string): string | null {
  const base = mpdResolveBase(mpdUrl);
  if (base === null) return null;

  const resolved = resolveUrl(mediaUrl, base);

  try {
    const resolvedUrl = new URL(resolved);
    const mpdQueryString = new URL(mpdUrl).search;
    if (!resolvedUrl.search && mpdQueryString) {
      resolvedUrl.search = mpdQueryString;
      return resolvedUrl.href;
    }
  } catch {
    // resolved is not a valid URL — return it as-is (best effort)
  }
  return resolved;
}

/** MPD-relative URL base (directory containing the .mpd file, without query/hash). */
function mpdResolveBase(mpdUrl: string): string | null {
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
    return null;
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