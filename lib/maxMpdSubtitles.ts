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
  /** Presentation-time offset (ms) parallel to segmentUrls; absolute cues when
   *  undefined. Populated by buildRepresentationSegmentUrls. */
  segmentOffsetsMs?: number[];
  /** Progressive numbered-segment fetch when total count is unknown. */
  segmentFetch?: SegmentFetchTemplate;
  language: string;
  mimeType?: string;
}

/** Max CDN serves top-level DASH manifests at extensionless authenticated paths. */
const MAX_EXTENSIONLESS_MPD_HOST = /(?:^|\.)prd\.media\.max\.com$/i;

/**
 * Max-owned hosts (the CDN plus the player's own domains). Any of them carries
 * the `manifest-params` auth token on every subtitle segment request (MAX-31),
 * so token re-attachment must not be limited to `prd.media.max.com`.
 */
const MAX_OWNED_HOST = /(?:^|\.)(?:max\.com|hbomax\.com)$/i;

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
    // Extensionless manifests are an asset id before the query, optionally
    // behind a short CDN prefix (`/v1/<id>`, `/dash/<id>`). Anything deeper is
    // a segment path, and a numeric leaf is a numbered segment (MAX-31).
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    if (pathSegments.length === 0 || pathSegments.length > 2) return false;
    const lastSegment = pathSegments[pathSegments.length - 1] ?? '';
    return !/^\d+$/.test(lastSegment);
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
        segmentOffsetsMs: built.offsetsMs,
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
  /** Presentation-time offset (ms) parallel to urls. */
  offsetsMs: number[];
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
  const mpdRootBaseUrl = getMpdRootBaseUrl(mpdXml);
  const periodBaseUrl = getPeriodBaseUrl(adaptationSet);
  const adaptationBaseUrl = getDirectChildBaseUrl(adaptationSet);
  const repBaseUrl = getDirectChildBaseUrl(rep);
  const baseChain = resolveBaseChain(baseUrl, mpdRootBaseUrl, periodBaseUrl, adaptationBaseUrl);

  const segmentTemplate =
    rep.querySelector('SegmentTemplate') ?? adaptationSet.querySelector('SegmentTemplate');
  const templateMedia = segmentTemplate?.getAttribute('media') ?? null;

  // MAX-23: a Representation BaseURL is the subtitle itself only when it names
  // a file, or when nothing else describes the media. A directory BaseURL
  // (`t/t6/`, `./`) is another level of the base hierarchy — fetching it as a
  // segment returns HTML/404 and the track is lost.
  const repBaseIsTerminal =
    repBaseUrl !== undefined && (baseUrlLooksLikeFile(repBaseUrl) || !templateMedia);
  const repDirectoryBase = repBaseIsTerminal ? undefined : repBaseUrl;

  if (repBaseIsTerminal && repBaseUrl) {
    const resolved = resolveSubtitleUrl(joinMediaPaths(baseChain, repBaseUrl), baseUrl);
    if (resolved && !isSelfReferentialSubtitleUrl(resolved, baseUrl)) {
      return { urls: [resolved], offsetsMs: [0] };
    }
    // Self-referential BaseURL (e.g. `dash.mpd`) — never offer the manifest
    // itself as a segment; fall through to the SegmentList/SegmentTemplate.
  }

  const mediaBaseUrl = repDirectoryBase
    ? resolveBaseLevel(baseChain, repDirectoryBase)
    : baseChain;

  const segmentListUrls = buildSegmentListUrls(rep, adaptationSet, baseUrl, mediaBaseUrl);
  if (segmentListUrls) {
    return { urls: segmentListUrls, offsetsMs: segmentListUrls.map(() => 0) };
  }

  if (!segmentTemplate) return null;

  const media = templateMedia;
  if (!media) return null;

  const templateContext = createTemplateContext(segmentTemplate, rep, mediaBaseUrl, baseUrl);
  const segmentCount = resolveSegmentCount(segmentTemplate, mpdXml);

  if (segmentCount === null) {
    const firstUrl = buildTemplatedSegmentUrl(templateContext, templateContext.startNumber);
    if (!firstUrl || isSelfReferentialSubtitleUrl(firstUrl, baseUrl)) return null;
    return {
      urls: [firstUrl],
      offsetsMs: [0],
      segmentFetch: {
        media: templateContext.media,
        startNumber: templateContext.startNumber,
        representationId: templateContext.representationId,
        bandwidth: templateContext.bandwidth,
        mpdUrl: baseUrl,
        // Persist the fully folded base: once the template is stored the MPD
        // root / Representation levels are gone, so a later segment number must
        // resolve from the same level (older templates used the raw
        // period/adaptation pair, still honoured by getEffectiveMediaBaseUrl).
        periodBaseUrl: templateContext.mediaBaseUrl,
      },
    };
  }

  // `$Time$` templates are keyed by presentation time, `$Number$` templates by
  // the running segment number (MAX-24). The timeline gives both, in the same
  // order as the URLs.
  const timelineTimes = expandSegmentTimeline(segmentTemplate).map((segment) => segment.time);

  const urls: string[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const resolved = buildTemplatedSegmentUrl(
      templateContext,
      templateContext.startNumber + i,
      timelineTimes[i],
    );
    if (!resolved || isSelfReferentialSubtitleUrl(resolved, baseUrl)) continue;
    urls.push(resolved);
  }

  const timelineOffsets = computeSegmentOffsetsMs(segmentTemplate);
  const offsetsMs =
    timelineOffsets.length === urls.length
      ? timelineOffsets
      : urls.map(() => 0);

  return urls.length > 0 ? { urls, offsetsMs } : null;
}

interface TemplateContext {
  media: string;
  startNumber: number;
  representationId: string;
  bandwidth: string;
  mpdUrl: string;
  /** Fully resolved base the media template is relative to. */
  mediaBaseUrl: string;
}

function createTemplateContext(
  segmentTemplate: Element,
  rep: Element,
  mediaBaseUrl: string,
  mpdUrl: string,
): TemplateContext {
  return {
    media: segmentTemplate.getAttribute('media') ?? '',
    startNumber: parseInt(segmentTemplate.getAttribute('startNumber') ?? '1', 10),
    representationId: rep.getAttribute('id') ?? '',
    bandwidth: rep.getAttribute('bandwidth') ?? '',
    mpdUrl,
    mediaBaseUrl,
  };
}

function buildTemplatedSegmentUrl(
  context: TemplateContext,
  number: number,
  time?: number,
): string | null {
  const mediaPath = applySegmentTemplate(context.media, context, number, time);
  return resolveSubtitleUrl(joinMediaPaths(context.mediaBaseUrl, mediaPath), context.mpdUrl);
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
      mediaBaseUrl: getEffectiveMediaBaseUrl(
        template.periodBaseUrl,
        template.adaptationBaseUrl,
        template.mpdUrl,
      ),
    },
    number,
  );
  if (!resolved || isSelfReferentialSubtitleUrl(resolved, template.mpdUrl)) return null;
  return resolved;
}

/**
 * Format a DASH template value, honouring the `%0Nd` width tag (`$Number%05d$`
 * → `00008`). Values are left-padded with zeros; non-numeric or absent widths
 * fall back to the plain decimal form.
 */
function formatTemplateValue(value: number, width?: string): string {
  const text = String(value);
  const parsedWidth = width ? parseInt(width, 10) : NaN;
  if (!Number.isFinite(parsedWidth) || parsedWidth <= text.length) return text;
  return text.padStart(parsedWidth, '0');
}

function applySegmentTemplate(
  media: string,
  context: TemplateContext,
  number: number,
  time?: number,
): string {
  return media
    // RepresentationID is non-numeric: the width tag cannot apply, so both
    // forms substitute the id verbatim.
    .replace(/\$RepresentationID(?:%0\d+d)?\$/g, context.representationId)
    .replace(/\$Bandwidth(?:%0(\d+)d)?\$/g, (_match, width: string | undefined) => {
      const bandwidth = parseInt(context.bandwidth, 10);
      return Number.isFinite(bandwidth)
        ? formatTemplateValue(bandwidth, width)
        : context.bandwidth;
    })
    .replace(/\$Number(?:%0(\d+)d)?\$/g, (_match, width: string | undefined) =>
      formatTemplateValue(number, width))
    .replace(/\$Time(?:%0(\d+)d)?\$/g, (match, width: string | undefined) =>
      time === undefined ? match : formatTemplateValue(time, width));
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
    const periodDuration = getEnclosingPeriodDurationSeconds(segmentTemplate, mpdXml);
    if (periodDuration && segmentDurationSec > 0) {
      return Math.min(
        Math.ceil(periodDuration / segmentDurationSec),
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

/**
 * Expand a SegmentTimeline into one entry per segment (the `r` repeat count is
 * unfolded), in presentation order and in timescale units.
 *
 * Each <S> may carry a `t` (absolute presentation time) and a `d` (duration);
 * `r` repeats the segment `r` more times. An absent `t` continues from the
 * previous segment's end. This is the authoritative source both for segment
 * offsets (segment-relative WebVTT timestamps → absolute timeline times) and
 * for `$Time$` media templates (MAX-24).
 */
function expandSegmentTimeline(segmentTemplate: Element): Array<{ time: number; duration: number }> {
  const timeline = findChildByLocalName(segmentTemplate, 'SegmentTimeline');
  if (!timeline) return [];

  const segments: Array<{ time: number; duration: number }> = [];
  let currentTime = 0;
  let first = true;

  for (const s of findChildrenByLocalName(timeline, 'S')) {
    const tAttr = s.getAttribute('t');
    if (tAttr !== null) {
      const t = parseInt(tAttr, 10);
      if (Number.isFinite(t)) currentTime = t;
    } else if (first) {
      currentTime = 0;
    }
    first = false;

    const d = parseInt(s.getAttribute('d') ?? '0', 10);
    const rAttr = s.getAttribute('r');
    const repeat = rAttr !== null ? parseInt(rAttr, 10) : 0;
    if (!Number.isFinite(repeat) || repeat < 0 || !Number.isFinite(d)) continue;

    for (let k = 0; k <= repeat; k++) {
      segments.push({ time: currentTime, duration: d });
      currentTime += d;
    }
  }

  return segments;
}

/**
 * Compute the DASH presentation-time offset (ms) for each <S> segment in a
 * SegmentTimeline, parallel to the segment URL order produced by
 * buildRepresentationSegmentUrls. Returns [] when there is no timeline.
 */
function computeSegmentOffsetsMs(segmentTemplate: Element): number[] {
  const timescale = parseInt(segmentTemplate.getAttribute('timescale') ?? '1', 10);
  if (!Number.isFinite(timescale) || timescale <= 0) return [];

  return expandSegmentTimeline(segmentTemplate).map((segment) => (segment.time / timescale) * 1000);
}

/**
 * Duration (seconds) of the Period enclosing `element` (MAX-24). Subtitle
 * segment counts must follow the Period the Representation lives in — the
 * first Period's duration truncates a later, longer Period and over-fetches a
 * shorter one. Falls back to the presentation duration (last resort, matching
 * the previous behaviour) when the Period declares no duration.
 */
function getEnclosingPeriodDurationSeconds(element: Element, mpdXml: Document): number | null {
  let parent: Element | null = element.parentElement;
  let period: Element | null = null;
  while (parent) {
    if (parent.localName === 'Period') {
      period = parent;
      break;
    }
    parent = parent.parentElement;
  }

  const periodDuration = parseIso8601Duration(period?.getAttribute('duration') ?? null);
  if (periodDuration) return periodDuration;

  const presentationDuration = parseIso8601Duration(
    mpdXml.documentElement.getAttribute('mediaPresentationDuration'),
  );
  if (presentationDuration && period) {
    // Last Period without an explicit duration runs until the presentation ends.
    const periodStart = parseIso8601Duration(period.getAttribute('start') ?? null) ?? 0;
    const remaining = presentationDuration - periodStart;
    if (remaining > 0) return remaining;
  }

  return getPresentationDuration(mpdXml);
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

/**
 * Direct `<MPD>`-level BaseURL — the outermost level of the DASH base
 * hierarchy (MAX-22). Level order per DASH: MPD → Period → AdaptationSet →
 * Representation, each resolved relative to its parent.
 */
function getMpdRootBaseUrl(mpdXml: Document): string | undefined {
  const root = mpdXml.documentElement;
  if (!root || root.localName !== 'MPD') return undefined;
  return getDirectChildBaseUrl(root);
}

/**
 * True when a BaseURL names a file (has an extension) rather than a directory.
 * A directory BaseURL must be folded into the SegmentTemplate/SegmentList
 * instead of being fetched as a segment (MAX-23).
 */
function baseUrlLooksLikeFile(value: string): boolean {
  const withoutQuery = value.split('?')[0]?.split('#')[0] ?? '';
  if (withoutQuery.endsWith('/')) return false;
  const lastSegment = withoutQuery.split('/').pop() ?? '';
  return /\.[a-z0-9]{1,6}$/i.test(lastSegment);
}

/** Resolve one BaseURL level against its parent (absolute levels replace it). */
function resolveBaseLevel(parentBase: string, level: string | undefined): string {
  const value = level?.trim();
  if (!value) return parentBase;
  if (/^https?:\/\//i.test(value)) {
    return value.endsWith('/') ? value : `${value}/`;
  }
  try {
    return new URL(value, parentBase).href;
  } catch {
    return parentBase;
  }
}

/**
 * Fold the MPD → Period → AdaptationSet (→ Representation directory) BaseURL
 * chain. Each relative level resolves against its parent, so a relative
 * AdaptationSet BaseURL is no longer silently dropped when the Period carries
 * an absolute BaseURL (MAX-22).
 */
function resolveBaseChain(mpdUrl: string, ...levels: Array<string | undefined>): string {
  let base = mpdResolveBase(mpdUrl) ?? mpdUrl;
  for (const level of levels) {
    base = resolveBaseLevel(base, level);
  }
  return base;
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

  const isMaxOwned = MAX_OWNED_HOST.test(resolvedUrl.hostname);
  const sameOrigin = resolvedUrl.origin === mpd.origin;
  if (!isMaxOwned && !sameOrigin) return;

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