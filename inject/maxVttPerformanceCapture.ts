/**
 * Performance-API-driven capture of HBO Max WebVTT subtitle segments.
 *
 * Max's player fetches VTT segments through a channel (Web Worker / MSE) that
 * window.fetch / XMLHttpRequest monkey-patching cannot observe. The Resource
 * Timing API, however, observes every resource load regardless of the
 * initiating execution context. A PerformanceObserver on 'resource' entries
 * surfaces the player's VTT segment URLs the instant they're recorded; a
 * page-context fetch then retrieves them with the page's own auth context
 * (which the extension background relay lacked — the previous MPD pipeline's
 * root failure).
 *
 * PerformanceObserver (event-driven, `buffered: true`) is used instead of
 * polling performance.getEntriesByType(): polling on an interval both adds up
 * to one interval's worth of latency per segment (noticeable right after a
 * seek, when the player fetches a fresh segment for the new position) and
 * races against the page calling performance.clearResourceTimings() — video
 * pages commonly clear the resource-timing buffer periodically, and a seek's
 * network burst makes hitting the 250-entry buffer cap during that window
 * more likely. A cleared entry that our poll hadn't read yet is lost forever.
 * PerformanceObserver instead delivers each entry via its callback at record
 * time, before the buffer can be cleared out from under it.
 *
 * Emits parsed cues into the rank-0 SUBTITLE_MANIFEST_CUES channel and drives
 * the existing MPD→DOM grace window via SUBTITLE_MPD_PROCESSING lifecycle msgs.
 */

import type { MessageBridgeSender } from '@/inject/messageBridge';
import { parseWebVTT } from '@/lib/subtitleParser';
import { parseSubtitleContent } from '@/lib/maxMpdSubtitles';
import { readMaxActiveSubtitleLanguage } from '@/lib/maxSubtitleLanguages';
import { nativeFetch } from '@/inject/nativeFetch';
import { findPrimaryVideo } from '@/lib/findPrimaryVideo';
import { MAX_MANIFEST_CUES } from '@/lib/constants';
import type { SubtitleCue } from '@/types/subtitle';

/**
 * Subtitle segment URLs on Max-controlled CDNs. Hosts observed in fixtures are
 * `*.prd.media.max.com`, but the handler's own notes also name
 * `beam-*.prd.api.hbomax.com` and generic Akamai/Fastly edges, so accept any
 * media.max.com / hbomax.com / max.com host and let the `/t/` path marker (or a
 * `.vtt`/`.ttml` extension) identify a subtitle segment.
 */
const MAX_SUBTITLE_RESOURCE_URL =
  /https?:\/\/(?:[^/]*\.)?(?:media\.max\.com|hbomax\.com|max\.com)\/.+\.(?:vtt|ttml)(?:\?|$)/i;

/** Give up + fall back to DOM if no VTT segment surfaces within this window. */
export const MAX_VTT_CAPTURE_DEADLINE_MS = 15_000;
/** Upper bound on deadline extensions while playback has not started. */
const MAX_DEADLINE_TOTAL_MS = 600_000;
/** Page-context fetch timeout per VTT segment. */
const PAGE_FETCH_TIMEOUT_MS = 15_000;

/** Bounded attempts per segment URL before it is marked permanently seen. */
export const MAX_SEGMENT_FETCH_ATTEMPTS = 2;
/** Delay between segment fetch attempts. */
const SEGMENT_RETRY_DELAY_MS = 250;

/**
 * Cooldown before a segment whose fetch exhausted its attempts is tried again.
 * A transient 403/CORS/timeout must not cost the segment for the whole
 * session: the URL is re-driven by the watchdog until it lands.
 */
export const SEGMENT_RECOVERY_COOLDOWN_MS = 5_000;
/** Recovery cycles before the backoff saturates (never a permanent poison). */
export const SEGMENT_RECOVERY_MAX_ATTEMPTS = 4;
/** Saturated cooldown: 5 s doubling over SEGMENT_RECOVERY_MAX_ATTEMPTS cycles. */
const SEGMENT_RECOVERY_MAX_COOLDOWN_MS = 40_000;
/** Failed segments re-driven per watchdog tick. */
const SEGMENT_RECOVERY_PER_TICK = 2;

/**
 * How long a representation must stay quiet before a segment from a different
 * representation is treated as a real track/Period switch instead of an
 * interleaved foreign segment (preview, lead-in advert). Without this gate a
 * second player's segments could hijack the rolling buffer.
 */
export const TRACK_SWITCH_IDLE_MS = 3_000;

/** No new segment for this long while playing ⇒ the capture has stalled. */
export const CAPTURE_STALL_MS = 20_000;
/** How often the watchdog evaluates capture health. */
export const WATCHDOG_INTERVAL_MS = 5_000;
/**
 * Every N emissions the full accumulated buffer is re-sent so a dropped
 * message cannot permanently desync the coordinator's buffer.
 */
export const FULL_RESYNC_EVERY = 20;
/** Concurrent segment fetches (network-bound, order of processing preserved). */
export const SEGMENT_FETCH_CONCURRENCY = 3;
/**
 * Resource Timing buffer size requested at capture start. The default 250
 * entries can overflow during a seek burst; on overflow we re-scan whatever is
 * still buffered instead of losing those segments.
 */
export const RESOURCE_TIMING_BUFFER_SIZE = 500;

/** Page-context fetch (native, not interceptor-patched). Overridable in tests. */
let pageFetch: typeof fetch = nativeFetch;

/** PerformanceObserver constructor — overridable in tests (jsdom has none). */
let ObserverCtor: typeof PerformanceObserver | undefined =
  typeof PerformanceObserver !== 'undefined' ? PerformanceObserver : undefined;

/** @internal Test hook — restore with resetPerformanceObserverCtorForTests(). */
export function setPerformanceObserverCtorForTests(ctor: typeof PerformanceObserver): void {
  ObserverCtor = ctor;
}

/** @internal Test hook */
export function resetPerformanceObserverCtorForTests(): void {
  ObserverCtor = typeof PerformanceObserver !== 'undefined' ? PerformanceObserver : undefined;
}

let perfObserver: PerformanceObserver | null = null;
let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let resourceTimingFullHandler: (() => void) | null = null;
let resourceTimingEventTarget: EventTarget | null = null;
/** One-shot guard so a stalled capture notifies the coordinator only once. */
let stalledNotified = false;

const seenUrls = new Set<string>();
/** URLs currently being fetched (guards against duplicate concurrent captures). */
const inFlightUrls = new Set<string>();
/**
 * Segments whose fetch exhausted its attempts: url → { attempts, nextAttemptAt }.
 * Kept separate from `seenUrls` on purpose — a failed fetch is not a parsed
 * segment, and treating it as seen is what lost the lines permanently.
 */
const failedSegments = new Map<string, { attempts: number; nextAttemptAt: number }>();

/** Record a failed fetch and schedule the next recovery attempt (capped backoff). */
function recordSegmentFailure(url: string): void {
  const attempts = (failedSegments.get(url)?.attempts ?? 0) + 1;
  // Doubling past SEGMENT_RECOVERY_MAX_ATTEMPTS would only re-clamp, so cap the
  // exponent: the cooldown saturates at SEGMENT_RECOVERY_MAX_COOLDOWN_MS.
  const cycles = Math.min(attempts, SEGMENT_RECOVERY_MAX_ATTEMPTS);
  const backoff = Math.min(
    SEGMENT_RECOVERY_COOLDOWN_MS * 2 ** (cycles - 1),
    SEGMENT_RECOVERY_MAX_COOLDOWN_MS,
  );
  failedSegments.set(url, { attempts, nextAttemptAt: Date.now() + backoff });
}

/** Forget a failed segment (successful parse, or a reset that re-captures it). */
function clearSegmentFailure(url: string): void {
  failedSegments.delete(url);
}

/** True while a failed segment is inside its cooldown — skip it this pass. */
function isSegmentRecoveryCoolingDown(url: string, now: number): boolean {
  const entry = failedSegments.get(url);
  return entry !== undefined && entry.nextAttemptAt > now;
}

/** Failed segments due for another attempt, bounded per tick. */
function dueFailedSegments(now: number): string[] {
  const due: string[] = [];
  for (const [url, entry] of failedSegments) {
    if (entry.nextAttemptAt > now) continue;
    if (seenUrls.has(url) || inFlightUrls.has(url)) continue;
    due.push(url);
    if (due.length >= SEGMENT_RECOVERY_PER_TICK) break;
  }
  return due;
}
let cueBuffer: SubtitleCue[] = [];
/**
 * Identity of the representation we've locked onto. Prefers the
 * `…/t/<asset>/t<n>/…` representation id; falls back to the `/t/<dir>/`
 * component so directory-style tracks (`…/t/t6/1.vtt`) keep a stable identity
 * across segments.
 */
let emittedIdentity: string | null = null;
/** Timestamp of the last segment accepted for `emittedIdentity`. */
let lastEmissionAt = 0;
/**
 * Monotonic reset counter. A segment fetch that resolves after any reset is a
 * stale continuation and must not re-lock the old identity.
 */
let captureGeneration = 0;
/** First captured VTT URL — labels MPD_PROCESSING mpdUrl field for logging. */
let activeCaptureUrl = '';
/** One-shot lifecycle flag so the grace window is driven exactly once. */
let processingCompleted = false;
/** Monotonic sequence attached to every SUBTITLE_MANIFEST_CUES emission. */
let manifestSeq = 0;
/** Emissions since the last full-buffer resync. */
let emissionsSinceResync = 0;

/**
 * Stable identity for a Max subtitle segment URL.
 *
 * The `/t/` path marker starts the representation chain and the directory
 * immediately above the segment file names the representation
 * (`…/a/t/caa516/t3/8.vtt` → `t3`, `…/t/t6/1.vtt` → `t6`). Prefer the last
 * `t<digits>` directory in the chain, else the last directory, so every
 * segment of one representation resolves to the same id while a lead-in or
 * preview representation keeps its own.
 *
 * Only the PATHNAME is considered: a `/t/…` sequence inside the query string
 * must not become an identity, and the old "first `/t/<dir>/` match" rule
 * happily picked a parent directory (`caa516`) over the representation.
 */
export function resolveTrackIdentity(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url.split('?')[0] ?? url;
  }
  const segments = pathname.split('/').filter(Boolean);
  // A trailing slash means the path itself is the directory — don't drop it.
  const dirs = pathname.endsWith('/') ? segments : segments.slice(0, -1);
  if (!dirs.some((dir) => dir.toLowerCase() === 't')) return null;
  const representation =
    [...dirs].reverse().find((dir) => /^t\d+$/i.test(dir)) ?? dirs.at(-1);
  return representation ? representation.toLowerCase() : null;
}

/** @internal Test hook — restore with resetPageFetchForTests(). */
export function setPageFetchForTests(fetchFn: typeof fetch): void {
  pageFetch = fetchFn;
}

/** @internal Test hook */
export function resetPageFetchForTests(): void {
  pageFetch = nativeFetch;
}

export function isMaxCdnSubtitleUrl(url: string): boolean {
  return MAX_SUBTITLE_RESOURCE_URL.test(url);
}

/** @deprecated Use isMaxCdnSubtitleUrl — kept for existing callers/tests. */
export function isMaxCdnVttUrl(url: string): boolean {
  return isMaxCdnSubtitleUrl(url);
}

/** Full reset (SPA navigation / BFCache / teardown). Stops the observer. */
export function resetMaxVttPerformanceCapture(): void {
  captureGeneration++;
  stopObserver();
  seenUrls.clear();
  inFlightUrls.clear();
  failedSegments.clear();
  cueBuffer = [];
  emittedIdentity = null;
  lastEmissionAt = 0;
  activeCaptureUrl = '';
  processingCompleted = false;
  stalledNotified = false;
  manifestSeq = 0;
  emissionsSinceResync = 0;
}

/**
 * Reset only the emission lock + cue buffer (keep the observer running).
 * Called on mid-session track switch so the new track's segments emit fresh.
 */
export function resetMaxVttPerformanceCaptureLock(): void {
  captureGeneration++;
  seenUrls.clear();
  inFlightUrls.clear();
  failedSegments.clear();
  cueBuffer = [];
  emittedIdentity = null;
  lastEmissionAt = 0;
  activeCaptureUrl = '';
  manifestSeq = 0;
  emissionsSinceResync = 0;
}

/**
 * Seek reset: clear `seenUrls` and `cueBuffer` but keep the observer running
 * and `emittedTrack` set. Called when the coordinator detects a video seek
 * (via SUBTITLE_SEEK_RESET bridge message) so that:
 *   1. VTT segments re-fetched for the new position are NOT skipped (seenUrls
 *      would otherwise suppress them), and
 *   2. The next SUBTITLE_MANIFEST_CUES message carries ONLY the new
 *      position's cues (cueBuffer would otherwise still hold old cues that
 *      merge with the new ones, polluting the coordinator's overlay).
 * `emittedTrack` is preserved because a seek does not change the subtitle
 * track — keeping it ensures the next segment goes through the append path
 * (lighter than re-activating the overlay from scratch).
 */
export function resetMaxVttCaptureForSeek(): void {
  captureGeneration++;
  seenUrls.clear();
  inFlightUrls.clear();
  // Segments re-fetched for the new position get a clean slate: a pre-seek
  // failure says nothing about the segment at the destination.
  failedSegments.clear();
  cueBuffer = [];
}

/** @internal Exposed for tests. */
export function isPerformanceCaptureRunning(): boolean {
  return perfObserver !== null;
}

function stopObserver(): void {
  if (perfObserver !== null) {
    perfObserver.disconnect();
    perfObserver = null;
  }
  if (deadlineTimer !== null) {
    clearTimeout(deadlineTimer);
    deadlineTimer = null;
  }
  stopWatchdog();
  if (resourceTimingFullHandler !== null && resourceTimingEventTarget !== null) {
    if (typeof resourceTimingEventTarget.removeEventListener === 'function') {
      resourceTimingEventTarget.removeEventListener('resourcetimingbufferfull', resourceTimingFullHandler);
    }
    resourceTimingFullHandler = null;
    resourceTimingEventTarget = null;
  }
}

/**
 * Ask for a larger Resource Timing buffer and, if it still overflows, re-scan
 * the entries that survived — the observer may have missed dropped ones.
 */
function installResourceTimingHeadroom(bridge: MessageBridgeSender): void {
  const perf = performance as Performance & {
    setResourceTimingBufferSize?: (size: number) => void;
  };
  perf.setResourceTimingBufferSize?.(RESOURCE_TIMING_BUFFER_SIZE);
  if (resourceTimingFullHandler !== null && resourceTimingEventTarget !== null) {
    if (typeof resourceTimingEventTarget.removeEventListener === 'function') {
      resourceTimingEventTarget.removeEventListener('resourcetimingbufferfull', resourceTimingFullHandler);
    }
  }
  // Browsers fire this on the Performance object; jsdom/older runtimes may not
  // expose EventTarget on it, so fall back to window.
  resourceTimingEventTarget =
    typeof (performance as unknown as EventTarget).addEventListener === 'function'
      ? (performance as unknown as EventTarget)
      : window;
  resourceTimingFullHandler = () => {
    void handleEntries(performance.getEntriesByType('resource'), bridge);
  };
  resourceTimingEventTarget.addEventListener('resourcetimingbufferfull', resourceTimingFullHandler);
}

/**
 * Arm (or re-arm) the no-segments deadline. While the primary video is paused
 * the deadline is extended, up to MAX_DEADLINE_TOTAL_MS from the first arm, so
 * a slow start does not demote the manifest tier before playback begins.
 */
function armCaptureDeadline(bridge: MessageBridgeSender, startedAt: number): void {
  if (deadlineTimer !== null) clearTimeout(deadlineTimer);
  deadlineTimer = setTimeout(() => {
    deadlineTimer = null;
    if (processingCompleted) return;
    const video = findPrimaryVideo();
    if (video && video.paused && Date.now() - startedAt < MAX_DEADLINE_TOTAL_MS) {
      armCaptureDeadline(bridge, startedAt);
      return;
    }
    processingCompleted = true;
    bridge.send('SUBTITLE_MPD_PROCESSING', {
      mpdUrl: activeCaptureUrl,
      platform: 'hbomax',
      status: 'complete',
      success: false,
    });
    console.log('AnyLLMTranslate: Max VTT capture deadline reached — no segments surfaced');
  }, MAX_VTT_CAPTURE_DEADLINE_MS);
}

function stopWatchdog(): void {
  if (watchdogTimer !== null) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

/**
 * Report a stalled capture to the coordinator so it can demote the manifest
 * tier and let DOM/TextTrack cues take over. A paused video is not a stall —
 * the player stops requesting segments while paused.
 *
 * Also re-drives segments whose fetch failed (see `recordSegmentFailure`):
 * the watchdog is the only timer guaranteed to run for the life of the
 * capture, so recovery piggybacks on it rather than owning another one.
 */
function startWatchdog(bridge: MessageBridgeSender): void {
  stopWatchdog();
  watchdogTimer = setInterval(() => {
    void retryFailedSegments(bridge);
    if (stalledNotified || emittedIdentity === null) return;
    if (Date.now() - lastEmissionAt < CAPTURE_STALL_MS) return;
    const video = findPrimaryVideo();
    if (!video || video.paused) return;
    stalledNotified = true;
    logCaptureStall();
    bridge.send('SUBTITLE_MPD_PROCESSING', {
      mpdUrl: activeCaptureUrl,
      platform: 'hbomax',
      status: 'stalled',
      success: false,
    });
  }, WATCHDOG_INTERVAL_MS);
}

function logCaptureStall(): void {
  console.warn('AnyLLMTranslate: Max VTT capture stalled — no new segment while playing', {
    url: activeCaptureUrl,
  });
}

/**
 * Start observing the Resource Timing API for Max VTT segments.
 * Returns a cleanup that fully stops + resets the observer.
 */
export function startMaxVttPerformanceCapture(bridge: MessageBridgeSender): () => void {
  if (perfObserver !== null) return () => resetMaxVttPerformanceCapture();

  // Defensive: environments without PerformanceObserver (jsdom, older browsers).
  if (!ObserverCtor) {
    console.log('AnyLLMTranslate: PerformanceObserver unavailable — Max VTT capture disabled');
    return () => {};
  }

  bridge.send('SUBTITLE_MPD_PROCESSING', {
    mpdUrl: '',
    platform: 'hbomax',
    status: 'started',
  });

  // Deadline: if no VTT surfaces, signal failure so the coordinator's DOM
  // fallback proceeds (mirrors the old MAX_MPD_IN_FLIGHT_CAP_MS behavior).
  // The clock only runs from playback: a paused player has not had a chance to
  // request segments yet, so give up only once playback has actually started.
  armCaptureDeadline(bridge, Date.now());

  try {
    perfObserver = new ObserverCtor((list) => {
      void handleEntries(list.getEntries(), bridge);
    });
    // buffered: true replays resource entries recorded before this observer
    // attached (e.g. segments the player already fetched during startup).
    perfObserver.observe({ type: 'resource', buffered: true });
    installResourceTimingHeadroom(bridge);
    startWatchdog(bridge);
  } catch (err) {
    console.log('AnyLLMTranslate: Failed to start Max VTT PerformanceObserver', err);
    perfObserver = null;
    if (deadlineTimer !== null) {
      clearTimeout(deadlineTimer);
      deadlineTimer = null;
    }
    return () => {};
  }

  console.log('AnyLLMTranslate: Max VTT PerformanceObserver capture started');
  return () => resetMaxVttPerformanceCapture();
}

async function handleEntries(
  entries: readonly PerformanceEntry[],
  bridge: MessageBridgeSender,
): Promise<void> {
  const newUrls: string[] = [];
  const now = Date.now();
  for (const entry of entries) {
    const url = entry.name;
    if (seenUrls.has(url) || inFlightUrls.has(url)) continue;
    if (!isMaxCdnSubtitleUrl(url)) continue;
    // A segment that failed recently waits out its cooldown; a fresh Resource
    // Timing entry after that is a legitimate second chance.
    if (isSegmentRecoveryCoolingDown(url, now)) continue;
    newUrls.push(url);
  }
  if (newUrls.length === 0) return;

  const generationAtFetch = captureGeneration;
  for (const url of newUrls) inFlightUrls.add(url);
  try {
    // Fetch concurrently (network-bound) but process in URL order so the first
    // segment still performs the initial overlay activation.
    const bodies = await mapWithConcurrency(newUrls, SEGMENT_FETCH_CONCURRENCY, (url) =>
      fetchSegmentWithRetry(url),
    );
    for (let i = 0; i < newUrls.length; i++) {
      const url = newUrls[i];
      if (url === undefined) continue;
      await captureSegment(url, bridge, bodies[i], generationAtFetch);
    }
  } finally {
    for (const url of newUrls) inFlightUrls.delete(url);
  }
}

/** Run `fn` over `items` with a bounded number of concurrent calls, preserving order. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await fn(item);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Re-fetch failed segments whose cooldown elapsed. Never throws. */
async function retryFailedSegments(bridge: MessageBridgeSender): Promise<void> {
  const due = dueFailedSegments(Date.now());
  if (due.length === 0) return;
  const generationAtFetch = captureGeneration;
  for (const url of due) inFlightUrls.add(url);
  try {
    const bodies = await mapWithConcurrency(due, SEGMENT_FETCH_CONCURRENCY, (url) =>
      fetchSegmentWithRetry(url),
    );
    for (let i = 0; i < due.length; i++) {
      const url = due[i];
      if (url === undefined) continue;
      // captureSegment re-records the failure (with a longer cooldown) when the
      // recovery attempt fails too, so no attempt can be lost or loop.
      await captureSegment(url, bridge, bodies[i], generationAtFetch);
    }
  } finally {
    // A reset during the fetch cleared inFlightUrls and may already have
    // re-registered these URLs for the new generation; the stale pass must not
    // delete a fresh registration, or the same segment is fetched twice.
    if (generationAtFetch === captureGeneration) {
      for (const url of due) inFlightUrls.delete(url);
    }
  }
}

async function captureSegment(
  url: string,
  bridge: MessageBridgeSender,
  prefetchedBody?: string | null,
  generationAtFetch?: number,
): Promise<void> {
  const generation = generationAtFetch ?? captureGeneration;
  const identity = resolveTrackIdentity(url) ?? url;

  const body = prefetchedBody !== undefined ? prefetchedBody : await fetchSegmentWithRetry(url);
  // Any reset while this fetch was in flight makes the result stale — a
  // seek/track switch/navigation must not be re-locked by the old track.
  if (generation !== captureGeneration) return;
  if (body === null) {
    // Exhausted the immediate attempts. Do NOT poison the URL as seen: keep it
    // in the cooldown map so the watchdog re-drives it. A transient 403/CORS/
    // timeout is the common case, and `seenUrls` is only cleared by a seek,
    // track switch or navigation — long after the lines were needed.
    recordSegmentFailure(url);
    console.warn('AnyLLMTranslate: Max VTT segment fetch failed — scheduled for recovery', { url });
    return;
  }
  const trimmed = body.trimStart();
  const isVtt = trimmed.startsWith('WEBVTT');
  const isTtml =
    !isVtt &&
    (trimmed.includes('<tt ') ||
      trimmed.includes('<tt>') ||
      trimmed.includes('xmlns="http://www.w3.org/ns/ttml"'));
  if (!isVtt && !isTtml) {
    seenUrls.add(url);
    // The URL is settled (parsed and discarded), so drop any recovery entry:
    // leaving it would keep the map consulting `seenUrls` for its whole life.
    clearSegmentFailure(url);
    console.warn('AnyLLMTranslate: Max subtitle segment is neither WebVTT nor TTML — ignoring', {
      url,
    });
    return;
  }
  seenUrls.add(url);
  clearSegmentFailure(url);
  stalledNotified = false;

  const language = readMaxActiveSubtitleLanguage();

  const newCues = (isVtt ? parseWebVTT(body) : parseSubtitleContent(body, '', url)).map((cue) => ({
    startTime: cue.startTime,
    endTime: cue.endTime,
    text: cue.text,
  }));
  const substantive = newCues.filter((c) => c.text.trim().length > 0);
  if (substantive.length === 0) return;

  const now = Date.now();
  const isKnownIdentity = emittedIdentity === identity;
  if (emittedIdentity !== null && !isKnownIdentity) {
    // A different representation. Only switch when the current one has gone
    // quiet; otherwise this is an interleaved foreign segment (preview/lead-in)
    // and must not hijack the rolling buffer.
    if (now - lastEmissionAt < TRACK_SWITCH_IDLE_MS) return;
    cueBuffer = [];
  }
  const isFirstEmission = emittedIdentity === null || !isKnownIdentity;
  emittedIdentity = identity;
  lastEmissionAt = now;

  cueBuffer = mergeCues(cueBuffer, newCues);

  // Same track, already emitted → progressive delta append into the active
  // overlay. Every FULL_RESYNC_EVERY emissions the whole accumulated buffer is
  // re-sent so a dropped message cannot permanently desync the coordinator.
  if (!isFirstEmission) {
    manifestSeq++;
    if (emissionsSinceResync >= FULL_RESYNC_EVERY) {
      emissionsSinceResync = 1;
      bridge.send('SUBTITLE_MANIFEST_CUES', {
        cues: cueBuffer,
        platform: 'hbomax',
        language,
        url,
        append: true,
        full: true,
        seq: manifestSeq,
      });
      return;
    }
    emissionsSinceResync++;
    bridge.send('SUBTITLE_MANIFEST_CUES', {
      cues: newCues,
      platform: 'hbomax',
      language,
      url,
      append: true,
      seq: manifestSeq,
    });
    return;
  }

  // First emission for this track.
  activeCaptureUrl = url;
  manifestSeq++;
  emissionsSinceResync = 1;

  console.log('AnyLLMTranslate: Captured Max VTT segment via Performance API', {
    trackId: identity,
    language,
    url,
    cueCount: cueBuffer.length,
  });

  bridge.send('SUBTITLE_MANIFEST_CUES', {
    cues: cueBuffer,
    platform: 'hbomax',
    language,
    url,
    seq: manifestSeq,
  });

  completeProcessing(bridge, true);
}

function completeProcessing(bridge: MessageBridgeSender, success: boolean): void {
  if (processingCompleted) return;
  processingCompleted = true;
  if (deadlineTimer !== null) {
    clearTimeout(deadlineTimer);
    deadlineTimer = null;
  }
  bridge.send('SUBTITLE_MPD_PROCESSING', {
    mpdUrl: activeCaptureUrl,
    platform: 'hbomax',
    status: 'complete',
    success,
  });
}

async function fetchSegment(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await pageFetch(url, { signal: controller.signal });
    if (!response.ok) {
      console.warn('AnyLLMTranslate: Max VTT segment fetch failed', {
        url,
        status: response.status,
      });
      return null;
    }
    return await response.text();
  } catch (error) {
    console.warn('AnyLLMTranslate: Max VTT segment fetch error', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a segment, retrying transient failures a bounded number of times. */
async function fetchSegmentWithRetry(url: string): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_SEGMENT_FETCH_ATTEMPTS; attempt++) {
    const body = await fetchSegment(url);
    if (body !== null) return body;
    if (attempt < MAX_SEGMENT_FETCH_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, SEGMENT_RETRY_DELAY_MS));
    }
  }
  return null;
}

function mergeCues(existing: SubtitleCue[], incoming: SubtitleCue[]): SubtitleCue[] {
  const byIdentity = new Map<string, SubtitleCue>();
  const keyFor = (cue: SubtitleCue) => `${cue.startTime}|${cue.endTime}|${cue.text}`;
  for (const cue of existing) byIdentity.set(keyFor(cue), cue);
  for (const cue of incoming) byIdentity.set(keyFor(cue), cue);
  const merged = Array.from(byIdentity.values()).sort((a, b) =>
    a.startTime - b.startTime ||
    a.endTime - b.endTime ||
    a.text.localeCompare(b.text),
  );
  // Keep the newest window: cues already behind the playhead are the least
  // useful, and a backward seek re-captures the destination's segments anyway.
  return merged.length > MAX_MANIFEST_CUES ? merged.slice(-MAX_MANIFEST_CUES) : merged;
}
