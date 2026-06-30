/**
 * Performance-API-driven capture of HBO Max WebVTT subtitle segments.
 *
 * Max's player fetches VTT segments through a channel (Web Worker / MSE) that
 * window.fetch / XMLHttpRequest monkey-patching cannot observe. The Resource
 * Timing API, however, observes every resource load regardless of the
 * initiating execution context. Polling performance.getEntriesByType('resource')
 * surfaces the player's VTT segment URLs; a page-context fetch then retrieves
 * them with the page's own auth context (which the extension background relay
 * lacked — the previous MPD pipeline's root failure).
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

const POLL_INTERVAL_MS = 1500;
/** Give up + fall back to DOM if no VTT segment surfaces within this window. */
const MAX_VTT_CAPTURE_DEADLINE_MS = 15_000;
/** Page-context fetch timeout per VTT segment. */
const PAGE_FETCH_TIMEOUT_MS = 15_000;

/** Page-context fetch (native, not interceptor-patched). Overridable in tests. */
let pageFetch: typeof fetch = nativeFetch;

let pollInterval: ReturnType<typeof setInterval> | null = null;
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

/** Full reset (SPA navigation / BFCache / teardown). Stops the poller. */
export function resetMaxVttPerformanceCapture(): void {
  stopPoller();
  seenUrls.clear();
  cueBuffer = [];
  emittedTrack = null;
  activeCaptureUrl = '';
  processingCompleted = false;
}

/**
 * Reset only the emission lock + cue buffer (keep the poller running).
 * Called on mid-session track switch so the new track's segments emit fresh.
 */
export function resetMaxVttPerformanceCaptureLock(): void {
  seenUrls.clear();
  cueBuffer = [];
  emittedTrack = null;
  activeCaptureUrl = '';
}

/** @internal Exposed for tests. */
export function isPerformanceCaptureRunning(): boolean {
  return pollInterval !== null;
}

function stopPoller(): void {
  if (pollInterval !== null) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (deadlineTimer !== null) {
    clearTimeout(deadlineTimer);
    deadlineTimer = null;
  }
}

/**
 * Start polling the Resource Timing API for Max VTT segments.
 * Returns a cleanup that fully stops + resets the poller.
 */
export function startMaxVttPerformanceCapture(bridge: MessageBridgeSender): () => void {
  if (pollInterval !== null) return () => resetMaxVttPerformanceCapture();

  // Defensive: environments without Resource Timing (jsdom, older browsers).
  if (
    typeof performance === 'undefined' ||
    typeof performance.getEntriesByType !== 'function'
  ) {
    console.log('AnyLLMTranslate: Performance API unavailable — Max VTT capture disabled');
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

  pollInterval = setInterval(() => {
    void pollOnce(bridge);
  }, POLL_INTERVAL_MS);

  console.log('AnyLLMTranslate: Max VTT Performance-API capture started');
  return () => resetMaxVttPerformanceCapture();
}

async function pollOnce(bridge: MessageBridgeSender): Promise<void> {
  let entries: PerformanceEntry[];
  try {
    entries = performance.getEntriesByType('resource');
  } catch {
    return;
  }

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
  const byStart = new Map<number, SubtitleCue>();
  for (const cue of existing) byStart.set(cue.startTime, cue);
  for (const cue of incoming) byStart.set(cue.startTime, cue);
  return Array.from(byStart.values()).sort((a, b) => a.startTime - b.startTime);
}
