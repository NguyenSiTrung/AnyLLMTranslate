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
import { readMaxActiveSubtitleLanguage } from '@/lib/maxSubtitleLanguages';
import { nativeFetch } from '@/inject/nativeFetch';
import type { SubtitleCue } from '@/types/subtitle';

const MAX_VTT_RESOURCE_URL =
  /https?:\/\/[^/]*prd\.media\.max\.com\/.+\.vtt(?:\?|$)/i;

/** Give up + fall back to DOM if no VTT segment surfaces within this window. */
const MAX_VTT_CAPTURE_DEADLINE_MS = 15_000;
/** Page-context fetch timeout per VTT segment. */
const PAGE_FETCH_TIMEOUT_MS = 15_000;

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

const seenUrls = new Set<string>();
let cueBuffer: SubtitleCue[] = [];
/** Track id of the representation we've locked onto (e.g. "t3"). */
let emittedTrack: string | null = null;
/** First captured VTT URL — labels MPD_PROCESSING mpdUrl field for logging. */
let activeCaptureUrl = '';
/** One-shot lifecycle flag so the grace window is driven exactly once. */
let processingCompleted = false;

/** @internal Test hook — restore with resetPageFetchForTests(). */
export function setPageFetchForTests(fetchFn: typeof fetch): void {
  pageFetch = fetchFn;
}

/** @internal Test hook */
export function resetPageFetchForTests(): void {
  pageFetch = nativeFetch;
}

export function isMaxCdnVttUrl(url: string): boolean {
  return MAX_VTT_RESOURCE_URL.test(url);
}

/** Full reset (SPA navigation / BFCache / teardown). Stops the observer. */
export function resetMaxVttPerformanceCapture(): void {
  stopObserver();
  seenUrls.clear();
  cueBuffer = [];
  emittedTrack = null;
  activeCaptureUrl = '';
  processingCompleted = false;
}

/**
 * Reset only the emission lock + cue buffer (keep the observer running).
 * Called on mid-session track switch so the new track's segments emit fresh.
 */
export function resetMaxVttPerformanceCaptureLock(): void {
  seenUrls.clear();
  cueBuffer = [];
  emittedTrack = null;
  activeCaptureUrl = '';
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
  seenUrls.clear();
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
  deadlineTimer = setTimeout(() => {
    if (!processingCompleted) {
      processingCompleted = true;
      bridge.send('SUBTITLE_MPD_PROCESSING', {
        mpdUrl: activeCaptureUrl,
        platform: 'hbomax',
        status: 'complete',
        success: false,
      });
      console.log('AnyLLMTranslate: Max VTT capture deadline reached — no segments surfaced');
    }
  }, MAX_VTT_CAPTURE_DEADLINE_MS);

  try {
    perfObserver = new ObserverCtor((list) => {
      void handleEntries(list.getEntries(), bridge);
    });
    // buffered: true replays resource entries recorded before this observer
    // attached (e.g. segments the player already fetched during startup).
    perfObserver.observe({ type: 'resource', buffered: true });
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
  for (const entry of entries) {
    const url = entry.name;
    if (seenUrls.has(url)) continue;
    if (!isMaxCdnVttUrl(url)) continue;
    seenUrls.add(url);
    newUrls.push(url);
  }

  for (const url of newUrls) {
    await captureSegment(url, bridge);
  }
}

async function captureSegment(url: string, bridge: MessageBridgeSender): Promise<void> {
  const body = await fetchSegment(url);
  if (body === null) return;
  if (!body.trimStart().startsWith('WEBVTT')) return;

  const trackId = extractTrackId(url) ?? url;
  const language = readMaxActiveSubtitleLanguage();

  const newCues = parseWebVTT(body).map((cue) => ({
    startTime: cue.startTime,
    endTime: cue.endTime,
    text: cue.text,
  }));
  const substantive = newCues.filter((c) => c.text.trim().length > 0);
  if (substantive.length === 0) return;

  // Locked onto a different track already → drop until a track-switch reset.
  if (emittedTrack !== null && emittedTrack !== trackId) return;

  cueBuffer = mergeCues(cueBuffer, newCues);

  // Same track, already emitted → progressive append into the active overlay.
  if (emittedTrack === trackId) {
    bridge.send('SUBTITLE_MANIFEST_CUES', {
      cues: cueBuffer,
      platform: 'hbomax',
      language,
      url,
      append: true,
    });
    return;
  }

  // First emission for this track.
  emittedTrack = trackId;
  activeCaptureUrl = url;

  console.log('AnyLLMTranslate: Captured Max VTT segment via Performance API', {
    trackId,
    language,
    url,
    cueCount: cueBuffer.length,
  });

  bridge.send('SUBTITLE_MANIFEST_CUES', {
    cues: cueBuffer,
    platform: 'hbomax',
    language,
    url,
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
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractTrackId(url: string): string | null {
  const match = url.match(/\/t\/[^/]+\/(t\d+)\//i);
  return match?.[1] ?? null;
}

function mergeCues(existing: SubtitleCue[], incoming: SubtitleCue[]): SubtitleCue[] {
  const byIdentity = new Map<string, SubtitleCue>();
  const keyFor = (cue: SubtitleCue) => `${cue.startTime}|${cue.endTime}|${cue.text}`;
  for (const cue of existing) byIdentity.set(keyFor(cue), cue);
  for (const cue of incoming) byIdentity.set(keyFor(cue), cue);
  return Array.from(byIdentity.values()).sort((a, b) =>
    a.startTime - b.startTime ||
    a.endTime - b.endTime ||
    a.text.localeCompare(b.text),
  );
}
