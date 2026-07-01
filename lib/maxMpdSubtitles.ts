/**
 * Max (HBO Max) DASH MPD subtitle extraction utilities.
 *
 * Pure parsing helpers plus async fetch/parse for subtitle track files.
 * Used by fetch/XHR interceptors to discover TTML subtitle tracks in .mpd manifests.
 */

import { parseSubtitles } from '@/lib/subtitleParser';
import { parseTTML } from '@/lib/ttmlParser';
import type { SubtitleSegmentFetchTemplate } from '@/types/subtitle';

/** Template for progressively fetching numbered WebVTT segments. */
export type SegmentFetchTemplate = SubtitleSegmentFetchTemplate;

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

/** Max CDN serves top-level DASH manifests at extensionless authenticated paths. */
const MAX_EXTENSIONLESS_MPD_HOST = /(?:^|\.)prd\.media\.max\.com$/i;

/** Safety cap for the SegmentTimeline/SegmentTemplate URL list. */
const MAX_SEGMENT_FETCH_COUNT = 3000;

/**
 * True when the URL is a Max CDN WebVTT segment request.
 * These endpoints may return a nested DASH MPD instead of VTT; callers must follow the chain.
 */
export function isMaxCdnVttSegmentUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!MAX_EXTENSIONLESS_MPD_HOST.test(parsed.hostname)) return false;
    const lastSegment = parsed.pathname.split('/').filter(Boolean).pop() ?? '';
    return /\.vtt$/i.test(lastSegment);
  } catch {
    return false;
  }
}

/** Returns true when the URL points to a DASH manifest (.mpd or Max CDN manifest path). */
export function detectMpdRequests(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase().split('?')[0].split('#')[0];
  if (lower.endsWith('.mpd')) return true;
  // Subtitle segment files carry manifest-params too — never treat them as MPD.
  if (lower.endsWith('.vtt') || lower.endsWith('.ttml')) return false;

  try {
    const parsed = new URL(url);
    if (!MAX_EXTENSIONLESS_MPD_HOST.test(parsed.hostname)) return false;
    if (!parsed.search.includes('manifest-params')) return false;
    // Extensionless top-level manifests are a single asset id before the query.
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    return pathSegments.length === 1;
  } catch {
    // ignore invalid URLs
  }

  return false;
}

/** True when response body/content-type is a DASH MPD manifest (not subtitle text). */
export function isDashManifestContent(body: string, contentType = ''): boolean {
  return isManifestResponse(body, contentType);
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

/** Parse subtitle body text into cues (VTT, SRT, or TTML). */
export function parseSubtitleContent(
  body: string,
  contentType: string,
  url: string,
): { startTime: number; endTime: number; text: string }[] {
  if (isManifestResponse(body, contentType)) {
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
  const periodBaseUrl = getPeriodBaseUrl(adaptationSet);
  const adaptationBaseUrl = getDirectChildBaseUrl(adaptationSet);
  const mediaBaseUrl = getEffectiveMediaBaseUrl(periodBaseUrl, adaptationBaseUrl, baseUrl);

  const baseUrlEl = rep.querySelector('BaseURL');
  if (baseUrlEl?.textContent?.trim()) {
    const resolved = resolveSubtitleUrl(
      joinMediaPaths(mediaBaseUrl, baseUrlEl.textContent.trim()),
      baseUrl,
    );
    if (resolved && !isSelfReferentialSubtitleUrl(resolved, baseUrl)) {
      return { urls: [resolved] };
    }
  }

  const segmentListUrls = buildSegmentListUrls(rep, adaptationSet, baseUrl, mediaBaseUrl);
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
    periodBaseUrl,
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
        periodBaseUrl: templateContext.periodBaseUrl,
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
  periodBaseUrl?: string;
  adaptationBaseUrl?: string;
}

function createTemplateContext(
  segmentTemplate: Element,
  rep: Element,
  adaptationSet: Element,
  mpdUrl: string,
  periodBaseUrl?: string,
  adaptationBaseUrl?: string,
): TemplateContext {
  return {
    media: segmentTemplate.getAttribute('media') ?? '',
    startNumber: parseInt(segmentTemplate.getAttribute('startNumber') ?? '1', 10),
    representationId: rep.getAttribute('id') ?? '',
    bandwidth: rep.getAttribute('bandwidth') ?? '',
    mpdUrl,
    periodBaseUrl,
    adaptationBaseUrl: adaptationBaseUrl ?? getDirectChildBaseUrl(adaptationSet),
  };
}

function buildTemplatedSegmentUrl(context: TemplateContext, number: number): string | null {
  const mediaPath = applySegmentTemplate(context.media, context, number);
  const mediaBase = getEffectiveMediaBaseUrl(
    context.periodBaseUrl,
    context.adaptationBaseUrl,
    context.mpdUrl,
  );
  return resolveSubtitleUrl(joinMediaPaths(mediaBase, mediaPath), context.mpdUrl);
}

/** Resolve a numbered segment URL from persisted SegmentTemplate metadata. */
export function resolveSegmentFetchUrl(
  template: SegmentFetchTemplate,
  number: number,
): string | null {
  const resolved = buildTemplatedSegmentUrl(
    {
      media: template.media,
      startNumber: template.startNumber,
      representationId: template.representationId,
      bandwidth: template.bandwidth,
      mpdUrl: template.mpdUrl,
      periodBaseUrl: template.periodBaseUrl,
      adaptationBaseUrl: template.adaptationBaseUrl,
    },
    number,
  );
  if (!resolved || isSelfReferentialSubtitleUrl(resolved, template.mpdUrl)) return null;
  return resolved;
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
  mediaBaseUrl?: string,
): string[] | null {
  const segmentList =
    rep.querySelector('SegmentList') ?? adaptationSet.querySelector('SegmentList');
  if (!segmentList) return null;

  const urls: string[] = [];
  for (const segmentUrlEl of Array.from(segmentList.querySelectorAll('SegmentURL'))) {
    const media = segmentUrlEl.getAttribute('media');
    if (!media) continue;
    const resolved = resolveSubtitleUrl(joinMediaPaths(mediaBaseUrl, media), baseUrl);
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

/** Walk up from an AdaptationSet to its enclosing Period BaseURL. */
function getPeriodBaseUrl(adaptationSet: Element): string | undefined {
  let parent: Element | null = adaptationSet.parentElement;
  while (parent) {
    if (parent.localName === 'Period') {
      return getDirectChildBaseUrl(parent);
    }
    parent = parent.parentElement;
  }
  return undefined;
}

/**
 * Resolve the base used to join SegmentTemplate / BaseURL media paths.
 * Period BaseURL wins (HBO Max APAC uses a different CDN host per Period).
 */
function getEffectiveMediaBaseUrl(
  periodBaseUrl: string | undefined,
  adaptationBaseUrl: string | undefined,
  mpdUrl: string,
): string {
  const mpdBase = mpdResolveBase(mpdUrl) ?? mpdUrl;

  const period = periodBaseUrl?.trim();
  if (period) {
    if (/^https?:\/\//i.test(period)) {
      return period.endsWith('/') ? period : `${period}/`;
    }
    try {
      return new URL(period, mpdBase).href;
    } catch {
      // fall through
    }
  }

  const adaptation = adaptationBaseUrl?.trim();
  if (adaptation) {
    if (/^https?:\/\//i.test(adaptation)) {
      return adaptation.endsWith('/') ? adaptation : `${adaptation}/`;
    }
    try {
      return new URL(adaptation, mpdBase).href;
    } catch {
      // fall through
    }
  }

  return mpdBase;
}

function joinMediaPaths(prefix: string | undefined, media: string): string {
  if (!prefix) return media;
  if (/^https?:\/\//i.test(media)) return media;
  const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
  const normalizedMedia = media.startsWith('/') ? media.slice(1) : media;
  return `${normalizedPrefix}${normalizedMedia}`;
}

function isMpdManifestBody(body: string): boolean {
  const trimmed = body.trimStart();
  return trimmed.includes('<MPD') && trimmed.includes('urn:mpeg:dash:schema:mpd');
}

/**
 * Detect manifest responses using both body content and Content-Type header.
 * Catches DASH MPDs that omit the namespace URI, as well as responses
 * served with a dash+xml content-type. TTML (application/ttml+xml) is NOT
 * treated as a manifest — it is valid subtitle content.
 */
export function isManifestResponse(body: string, contentType: string): boolean {
  // Defensive: WebVTT content is never a manifest, even if the CDN mislabels
  // the Content-Type as application/dash+xml.
  const trimmed = body.trimStart();
  if (trimmed.startsWith('WEBVTT')) return false;

  if (isMpdManifestBody(body)) return true;

  if (trimmed.includes('<MPD')) return true;
  if (trimmed.includes('<Period') && trimmed.includes('AdaptationSet')) return true;

  const ct = contentType.toLowerCase();
  if (ct.includes('dash+xml') && !ct.includes('ttml')) return true;

  return false;
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

    const mpdLastSegment = mpdPath.slice(mpdPath.lastIndexOf('/') + 1);
    if (
      mpdLastSegment &&
      !mpdLastSegment.includes('.') &&
      track.origin === mpd.origin &&
      trackPath === `${mpdPath}/${mpdLastSegment}`
    ) {
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
 * Merge missing query params from the intercepted manifest URL onto a resolved
 * subtitle segment URL. Max's CDN requires manifest-params (and rtype, market,
 * etc.) on every segment request; RFC 3986 relative resolution drops them.
 */
export function mergeManifestQueryParams(resolvedUrl: URL, mpdUrl: string): void {
  let mpd: URL;
  try {
    mpd = new URL(mpdUrl);
  } catch {
    return;
  }

  const mpdParams = mpd.searchParams;
  if (mpdParams.toString() === '') return;

  const isMaxCdn = MAX_EXTENSIONLESS_MPD_HOST.test(resolvedUrl.hostname);
  const sameOrigin = resolvedUrl.origin === mpd.origin;
  if (!isMaxCdn && !sameOrigin) return;

  const existing = resolvedUrl.searchParams;
  for (const [key, value] of mpdParams) {
    if (!existing.has(key)) {
      existing.set(key, value);
    }
  }
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
    mergeManifestQueryParams(resolvedUrl, mpdUrl);
    return resolvedUrl.href;
  } catch {
    // resolved is not a valid URL — return it as-is (best effort)
  }
  return resolved;
}

/** MPD-relative URL base, preserving extensionless Max manifest paths as directories. */
function mpdResolveBase(mpdUrl: string): string | null {
  try {
    const url = new URL(mpdUrl);
    url.search = '';
    url.hash = '';
    if (url.pathname.endsWith('/')) {
      return url.href;
    }

    const slash = url.pathname.lastIndexOf('/');
    const lastSegment = slash >= 0 ? url.pathname.slice(slash + 1) : url.pathname;
    if (lastSegment.includes('.')) {
      url.pathname = url.pathname.slice(0, slash + 1);
    } else if (url.pathname !== '/') {
      url.pathname = `${url.pathname}/`;
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