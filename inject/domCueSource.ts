/**
 * DOM Cue Source — scrapes platform-rendered captions from the DOM.
 *
 * For platforms (e.g. HBO Max) that render captions themselves instead of
 * exposing a VTT URL or native TextTrack. Observes a stable ancestor and
 * samples video.currentTime on each cue-text change to derive cue timing.
 *
 * Mirrors textTrackDiscovery.ts shape: returns a cleanup function.
 */

import { findPrimaryVideo } from '@/lib/findPrimaryVideo';
import { OPEN_CUE_END_SENTINEL } from '@/lib/subtitleTiming';
import type { MessageBridgeSender } from '@/inject/messageBridge';
import type { SubtitleHandler } from '@/inject/subtitleHandlers/registry';
import type { SubtitleCue, SubtitleDomCuesPayload } from '@/types/subtitle';

/** Maximum number of cues to keep in the rolling buffer (sliding window). */
const MAX_CUES = 200;

/** Debounce a function by ms. Coalesces rapid calls into one. */
function debounce<T extends () => void>(fn: T, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

/**
 * Start observing the page for DOM-rendered captions.
 * Emits SUBTITLE_DOM_CUES messages with a rolling SubtitleCue[] (capped at MAX_CUES).
 * Returns a cleanup function. Returns a no-op cleanup when the handler
 * exposes no DOM cue source, or when no video / observe root is present.
 */
/**
 * DOM Cue Source — scrapes platform-rendered captions from the DOM.
 *
 * For platforms (e.g. HBO Max) that render captions themselves instead of
 * exposing a VTT URL or native TextTrack. Observes a stable ancestor and
 * samples video.currentTime on each cue-text change to derive cue timing.
 *
 * Both the <video> element and the caption overlay may be inserted late by the
 * platform's SPA/player (Max mounts its React player after DOMContentLoaded).
 * This function therefore observes document.documentElement for added nodes and
 * (re)attaches the cue observer + video listener when the dependencies appear,
 * mirroring textTrackDiscovery.ts's deferred-attach pattern. Returns a no-op
 * cleanup only when the handler exposes no DOM cue source.
 */
export function startDomCueSource(handler: SubtitleHandler, bridge: MessageBridgeSender): () => void {
  const domSource = handler.getDomCueSource?.();
  if (!domSource) return () => {};

  const cues: SubtitleCue[] = [];
  let lastText = '';
  let openCue: SubtitleCue | null = null;

  /** Reset the rolling cue buffer (e.g. on mid-session track switch). */
  const resetBuffer = () => {
    cues.length = 0;
    lastText = '';
    openCue = null;
  };

  const emit = (language: string, videoId?: string) => {
    // Deep-copy each cue so downstream listeners cannot mutate the rolling
    // buffer's cue objects (e.g. overwriting openCue.endTime). A shallow
    // `[...cues]` array copy still shares the same SubtitleCue references.
    const cuesSnapshot = cues.map((c) => ({
      ...c,
      text: c.text,
      startTime: c.startTime,
      endTime: c.endTime,
    }));
    const payload: SubtitleDomCuesPayload = {
      cues: cuesSnapshot,
      platform: handler.platform,
      language,
      videoId,
    };
    bridge.send('SUBTITLE_DOM_CUES', payload);
  };

  /** Currently-attached cue observer + its video + pause handler (for cleanup on re-attach). */
  let attached: {
    observer: MutationObserver;
    video: HTMLVideoElement;
    pauseHandler: () => void;
    seekedHandler: () => void;
  } | null = null;

  const sampleCue = (video: HTMLVideoElement) => {
    const cueEl = document.querySelector<HTMLElement>(domSource.cueSelector);
    const text = cueEl?.textContent?.trim() ?? '';
    // Text disappeared (cue gap) — close any open cue.
    if (!text) {
      if (openCue) {
        openCue.endTime = video.currentTime;
        openCue = null;
        lastText = '';
        emit(domSource.readActiveLanguage(), domSource.videoIdExtractor?.());
      }
      return;
    }
    if (text === lastText) return;

    const t = video.currentTime;
    // Close previous open cue at the new cue's start time.
    if (openCue) {
      openCue.endTime = t;
      openCue = null;
    }

    // Use the OPEN_CUE_END_SENTINEL for the open (current) cue so the overlay's
    // findActiveCue() can match it. The next cue will close this one precisely.
    // (Number.MAX_SAFE_INTEGER — not 86400, which a >24h film would overflow.)
    const cue: SubtitleCue = { startTime: t, endTime: OPEN_CUE_END_SENTINEL, text };
    cues.push(cue);
    // Sliding window: cap buffer to last MAX_CUES entries
    if (cues.length > MAX_CUES) {
      cues.splice(0, cues.length - MAX_CUES);
    }
    openCue = cue;
    lastText = text;

    emit(domSource.readActiveLanguage(), domSource.videoIdExtractor?.());
  };

  /** Attach the cue observer to a video + caption-overlay pair. Idempotent. */
  const attach = (video: HTMLVideoElement, rootEl: HTMLElement) => {
    // Detach any prior attachment (e.g. player re-mounted).
    detach();

    const observer = new MutationObserver(
      debounce(() => sampleCue(video), 50),
    );
    observer.observe(rootEl, { childList: true, subtree: true, characterData: true });

    const pauseHandler = () => {
      if (openCue) {
        openCue.endTime = video.currentTime;
        emit(domSource.readActiveLanguage(), domSource.videoIdExtractor?.());
      }
    };
    video.addEventListener('pause', pauseHandler);

    // On seek, finalize the currently-open cue at the NEW currentTime so its
    // endTime reflects real playback. A forward seek (e.g. 10s→5min) gives the
    // cue an honest span ending at 5min; a backward seek clamps to
    // startTime + 0.1s so the cue is a tiny sliver that vanishes immediately
    // rather than spanning the jump or lingering as stale text.
    // (Pre-fix this set endTime = startTime, producing a zero-duration cue that
    // vanished as if it had never existed — losing the just-displayed caption.)
    const seekedHandler = () => {
      if (openCue) {
        openCue.endTime = Math.max(video.currentTime, openCue.startTime + 0.1);
        emit(domSource.readActiveLanguage(), domSource.videoIdExtractor?.());
        openCue = null;
      }
    };
    video.addEventListener('seeked', seekedHandler);

    attached = { observer, video, pauseHandler, seekedHandler };
    // Sample once in case a cue is already showing.
    sampleCue(video);
  };

  const detach = () => {
    if (!attached) return;
    attached.observer.disconnect();
    attached.video.removeEventListener('pause', attached.pauseHandler);
    attached.video.removeEventListener('seeked', attached.seekedHandler);
    attached = null;
  };

  /** Re-evaluate whether both the video and caption overlay are present; attach if so. */
  const tryAttach = () => {
    if (attached) return; // already attached
    const video = findPrimaryVideo();
    const rootEl = document.querySelector<HTMLElement>(domSource.observeRootSelector);
    if (video && rootEl) {
      attach(video, rootEl);
    }
  };

  // Watch for dynamically inserted video / caption-overlay nodes (Max's React
  // player mounts after DOMContentLoaded). Re-evaluate on each added subtree.
  const documentObserver = new MutationObserver(
    debounce(tryAttach, 50),
  );
  documentObserver.observe(document.documentElement, { childList: true, subtree: true });

  // Initial attempt (dependencies may already be present at startup).
  tryAttach();

  // Reset the rolling buffer when the user switches Max's subtitle track
  // mid-session (a different track's cues are unrelated to the prior buffer).
  // Filter to text-track buttons only — Max has other aria-checked controls
  // (settings toggles, audio menu) that must NOT reset the cue buffer.
  const trackObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type !== 'attributes' || m.attributeName !== 'aria-checked') continue;
      const target = m.target as HTMLElement;
      if (
        target.getAttribute('aria-checked') === 'true' &&
        target.getAttribute('data-testid') === 'player-ux-text-track-button'
      ) {
        console.log('[AnyLLMTranslate] Max subtitle track changed — resetting DOM cue buffer');
        resetBuffer();
        bridge.send('SUBTITLE_DOM_TRACK_CHANGED', {
          platform: handler.platform,
          language: domSource.readActiveLanguage(),
          videoId: domSource.videoIdExtractor?.(),
        });
        return;
      }
    }
  });
  trackObserver.observe(document.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ['aria-checked'],
  });

  return () => {
    documentObserver.disconnect();
    trackObserver.disconnect();
    detach();
  };
}