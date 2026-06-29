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
  /** Period-level BaseURL from the parent Period (HBO Max APAC CDN). */
  periodBaseUrl?: string;
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

/** Optional segment fetcher (e.g. background CORS bypass from MAIN world). */
export type SubtitleSegmentFetchFn = (url: string) => Promise<{
  ok: boolean;
  status: number;
  text: string;
  contentType: string;
}>;

export interface FetchAndParseSubtitleOptions {
  segmentUrls?: string[];
  segmentFetch?: SegmentFetchTemplate;
  fetchSegment?: SubtitleSegmentFetchFn;
  /** Pre-seed with known MPD bodies (e.g. root manifest) to fail fast on CDN echo. */
  seenManifests?: Set<string>;
}

/** Safety cap for segmented WebVTT fetches (HBO Max can list thousands of segments). */
const MAX_SEGMENT_FETCH_COUNT = 3000;
const MAX_PROGRESSIVE_SEGMENT_FETCH_COUNT = 120;
const MAX_NESTED_MPD_DEPTH = 3;
const MAX_CIRCULAR_MANIFEST_LOGS = 3;
let circularManifestLogCount = 0;

/** Reset circular-manifest log dedup (for tests). */
export function resetMaxMpdSubtitleFetchDiagnostics(): void {
  circularManifestLogCount = 0;
}

function logCircularManifestReference(context: 'segment' | 'progressive'): void {
  circularManifestLogCount += 1;
  if (circularManifestLogCount > MAX_CIRCULAR_MANIFEST_LOGS) return;
  const suffix = circularManifestLogCount === MAX_CIRCULAR_MANIFEST_LOGS
    ? ' (further occurrences suppressed)'
    : '';
  if (context === 'progressive') {
    console.log(`[AnyLLMTranslate] Circular manifest reference detected in progressive fetch. Skipping.${suffix}`);
  } else {
    console.log(`[AnyLLMTranslate] Circular manifest reference detected. Skipping.${suffix}`);
  }
}

/** Max CDN serves top-level DASH manifests at extensionless authenticated paths. */
const MAX_EXTENSIONLESS_MPD_HOST = /(?:^|\.)prd\.media\.max\.com$/i;

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

/**
 * Prefer main-content subtitle tracks over short lead-in Period segments.
 * HBO Max multi-Period manifests list a ~30s Period 0 (startNumber=1) and
 * longer Periods with startNumber>1 for the rest of the presentation.
 */
export function prioritizeMpdTracksForFetch(tracks: MpdSubtitleTrack[]): MpdSubtitleTrack[] {
  return [...tracks].sort((a, b) => scoreMpdTrackForFetch(b) - scoreMpdTrackForFetch(a));
}

/** @internal Scoring helper exported for tests. */
export function scoreMpdTrackForFetch(track: MpdSubtitleTrack): number {
  let score = 0;
  const start = inferSegmentStartNumber(track);
  if (start > 1) score += start * 100;
  if (track.segmentUrls && track.segmentUrls.length > 1) {
    score += track.segmentUrls.length * 10;
  }
  return score;
}

function inferSegmentStartNumber(track: MpdSubtitleTrack): number {
  if (track.segmentFetch?.startNumber) return track.segmentFetch.startNumber;
  const match = track.url.match(/\/(\d+)\.vtt(?:\?|$)/i);
  if (match) {
    const n = parseInt(match[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
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
  return fetchAndParseSubtitleInternal(
    url,
    resolvedOptions,
    0,
    resolvedOptions.fetchSegment,
    resolvedOptions.seenManifests,
  );
}

/** Result of a validated subtitle content fetch (not a manifest). */
export interface FetchedSubtitleContent {
  url: string;
  content: string;
  contentType: string;
}

/**
 * Fetch a subtitle track URL and validate the response is real subtitle content
 * (not another DASH MPD manifest). Returns null when the response is a manifest
 * or the fetch fails, so callers can skip to the next track or fall back to DOM.
 *
 * NOTE: do NOT send `credentials: 'include'`. Max's CDN authenticates via the
 * auth token embedded in the URL query string (manifest-params=...), not via
 * cookies. Sending credentials forces a credentialed CORS request, which Max's
 * CDN rejects (it returns `Access-Control-Allow-Origin: *`, which is forbidden
 * with credentials) — so every subtitle segment fails with net::ERR_FAILED and
 * the extension falls back to the DOM-cue path.
 */
export async function fetchRealSubtitleContent(
  trackUrl: string,
  _mpdUrl?: string,
): Promise<FetchedSubtitleContent | null> {
  try {
    const res = await fetch(trackUrl);
    if (!res.ok) return null;

    const contentType = res.headers.get('Content-Type') ?? '';
    const text = await res.text();

    if (isManifestResponse(text, contentType)) {
      console.warn('[AnyLLMTranslate] Track returned another manifest. Skipping.', trackUrl);
      return null;
    }

    return { url: trackUrl, content: text, contentType };
  } catch (err) {
    console.error('[AnyLLMTranslate] Failed to fetch subtitle track:', err);
    return null;
  }
}

/**
 * Process subtitle tracks found in an MPD: fetch each, validate it is real
 * subtitle content (not another manifest), and return the valid ones.
 * Returns null when no tracks yielded real content, signalling DOM fallback.
 */
export async function processMpdSubtitleTracks(
  tracks: MpdSubtitleTrack[],
  mpdUrl?: string,
): Promise<FetchedSubtitleContent[] | null> {
  const validTracks: FetchedSubtitleContent[] = [];

  for (const track of tracks) {
    const result = await fetchRealSubtitleContent(track.url, mpdUrl);
    if (result) {
      console.log('[AnyLLMTranslate] Successfully fetched real subtitle content', {
        language: track.language,
        length: result.content.length,
      });
      validTracks.push(result);
    }
  }

  if (validTracks.length > 0) {
    console.log('[AnyLLMTranslate] Got', validTracks.length, 'real subtitle tracks');
    return validTracks;
  }

  console.log('[AnyLLMTranslate] No direct subtitle content found. Using DOM fallback.');
  return null;
}

async function fetchSegmentResponse(
  segmentUrl: string,
  fetchSegment?: SubtitleSegmentFetchFn,
): Promise<{ ok: boolean; status: number; text: string; contentType: string }> {
  if (fetchSegment) {
    const r = await fetchSegment(segmentUrl);
    return { ok: r.ok, status: r.status, text: r.text, contentType: r.contentType };
  }
  const response = await fetch(segmentUrl);
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    text,
    contentType: response.headers.get('Content-Type') ?? '',
  };
}

async function fetchAndParseSubtitleInternal(
  url: string,
  options: string[] | FetchAndParseSubtitleOptions | undefined,
  nestedDepth: number,
  fetchSegment?: SubtitleSegmentFetchFn,
  seenManifests?: Set<string>,
): Promise<ParsedSubtitleCue[]> {
  const resolvedOptions: FetchAndParseSubtitleOptions = Array.isArray(options)
    ? { segmentUrls: options }
    : (options ?? {});
  const segmentFetcher = resolvedOptions.fetchSegment ?? fetchSegment;

  let bodies: string[] = [];
  let contentType = '';

  if (resolvedOptions.segmentFetch) {
    const progressive = await fetchSegmentBodiesProgressively(
      resolvedOptions.segmentFetch,
      nestedDepth,
      segmentFetcher,
      seenManifests,
    );
    if (progressive.kind === 'cues') {
      return progressive.cues;
    }
    bodies = progressive.bodies;
    contentType = progressive.contentType;
  } else {
    const urls =
      resolvedOptions.segmentUrls && resolvedOptions.segmentUrls.length > 0
        ? resolvedOptions.segmentUrls
        : [url];

    for (const segmentUrl of urls) {
      const segment = await fetchSegmentResponse(segmentUrl, segmentFetcher);
      if (!segment.ok) {
        throw new Error(`Subtitle fetch failed: HTTP ${segment.status}`);
      }
      const text = segment.text;
      const respContentType = segment.contentType;
      if (isManifestResponse(text, respContentType)) {
        const nextSeen = new Set(seenManifests || []);
        const normalizedBody = text.trim();
        if (nextSeen.has(normalizedBody)) {
          logCircularManifestReference('segment');
          return [];
        }
        nextSeen.add(normalizedBody);
        return fetchAndParseNestedMpdSubtitle(text, segmentUrl, nestedDepth, segmentFetcher, nextSeen);
      }
      bodies.push(text);
      if (!contentType) {
        contentType = respContentType;
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

async function fetchAndParseNestedMpdSubtitle(
  mpdText: string,
  mpdUrl: string,
  nestedDepth: number,
  fetchSegment?: SubtitleSegmentFetchFn,
  seenManifests?: Set<string>,
): Promise<ParsedSubtitleCue[]> {
  if (nestedDepth >= MAX_NESTED_MPD_DEPTH) {
    throw new Error('Subtitle fetch returned MPD manifest instead of subtitle content');
  }

  const nestedDoc = parseMpd(mpdText, mpdUrl);
  if (!nestedDoc) {
    throw new Error('Subtitle fetch returned MPD manifest instead of subtitle content');
  }

  const nestedTracks = extractSubtitleTracks(nestedDoc, mpdUrl);
  for (const nestedTrack of nestedTracks) {
    if (normalizeSubtitleUrl(nestedTrack.url) === normalizeSubtitleUrl(mpdUrl)) continue;

    try {
      const cues = await fetchAndParseSubtitleInternal(
        nestedTrack.url,
        {
          segmentUrls: nestedTrack.segmentUrls,
          segmentFetch: nestedTrack.segmentFetch,
          fetchSegment,
        },
        nestedDepth + 1,
        fetchSegment,
        seenManifests,
      );
      if (cues.length > 0) return cues;
    } catch (err) {
      console.error('DEBUG Nested Fetch Error:', err);
      // Try the next nested track before giving up to DOM fallback.
    }
  }

  throw new Error('Subtitle fetch returned MPD manifest instead of subtitle content');
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

type ProgressiveSegmentResult =
  | { kind: 'bodies'; bodies: string[]; contentType: string }
  | { kind: 'cues'; cues: ParsedSubtitleCue[] };

async function fetchSegmentBodiesProgressively(
  template: SegmentFetchTemplate,
  nestedDepth: number,
  fetchSegment?: SubtitleSegmentFetchFn,
  seenManifests?: Set<string>,
): Promise<ProgressiveSegmentResult> {
  const bodies: string[] = [];
  let contentType = '';
  const context: TemplateContext = {
    media: template.media,
    startNumber: template.startNumber,
    representationId: template.representationId,
    bandwidth: template.bandwidth,
    mpdUrl: template.mpdUrl,
    periodBaseUrl: template.periodBaseUrl,
    adaptationBaseUrl: template.adaptationBaseUrl,
  };

  for (let i = 0; i < MAX_PROGRESSIVE_SEGMENT_FETCH_COUNT; i++) {
    const segmentUrl = buildTemplatedSegmentUrl(context, template.startNumber + i);
    if (!segmentUrl) break;

    const segment = await fetchSegmentResponse(segmentUrl, fetchSegment);
    if (!segment.ok) break;

    const text = segment.text;
    const respContentType = segment.contentType;
    if (isManifestResponse(text, respContentType)) {
      const nextSeen = new Set(seenManifests || []);
      const normalizedBody = text.trim();
      if (nextSeen.has(normalizedBody)) {
        logCircularManifestReference('progressive');
        break;
      }
      nextSeen.add(normalizedBody);
      const nestedCues = await fetchAndParseNestedMpdSubtitle(text, segmentUrl, nestedDepth, fetchSegment, nextSeen);
      if (nestedCues.length > 0) {
        return { kind: 'cues', cues: nestedCues };
      }
      break;
    }

    bodies.push(text);
    if (!contentType) contentType = respContentType;
  }

  return { kind: 'bodies', bodies, contentType };
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
function isManifestResponse(body: string, contentType: string): boolean {
  if (isMpdManifestBody(body)) return true;

  const trimmed = body.trimStart();
  if (trimmed.includes('<MPD')) return true;
  if (trimmed.includes('<Period') && trimmed.includes('AdaptationSet')) return true;

  const ct = contentType.toLowerCase();
  if (ct.includes('dash+xml') && !ct.includes('ttml')) return true;

  return false;
}

function normalizeSubtitleUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '');
  } catch {
    return url.split('?')[0].split('#')[0].replace(/\/$/, '');
  }
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