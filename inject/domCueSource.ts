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
import { resetMaxVttPerformanceCaptureLock } from '@/inject/maxVttPerformanceCapture';
import { onMessage } from '@/inject/messageBridge';
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

  /** Currently-attached cue observer + its video + handlers (for cleanup on re-attach). */
  let attached: {
    observer: MutationObserver;
    video: HTMLVideoElement;
    rootEl: HTMLElement;
    pauseHandler: () => void;
    playHandler: () => void;
    seekedHandler: () => void;
    emptiedHandler: () => void;
    loadstartHandler: () => void;
  } | null = null;

  /**
   * Read the current cue text from the caption root.
   *
   * Platform renderers may emit one node per caption row (Max renders a
   * `cueBoxRowTextCue` per row), so every match in DOM order is joined — a
   * single `querySelector` would drop the second row of a two-line caption.
   * Scoping to the attached root first avoids picking up a detached/hidden
   * renderer (e.g. a preloaded player or a thumbnail overlay).
   */
  const readCueText = (rootEl: HTMLElement | null): string => {
    const scoped = rootEl
      ? Array.from(rootEl.querySelectorAll<HTMLElement>(domSource.cueSelector))
      : [];
    const nodes = scoped.length > 0
      ? scoped
      : Array.from(document.querySelectorAll<HTMLElement>(domSource.cueSelector));
    return nodes
      .map((n) => n.textContent?.trim() ?? '')
      .filter(Boolean)
      .join('\n');
  };

  const sampleCue = (video: HTMLVideoElement) => {
    const text = readCueText(attached?.rootEl ?? null);
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

  /**
   * A seek starts a new rolling timeline. Re-sampling after clearing lastText
   * is important when the caption at the destination is identical to the
   * caption before the seek; it is still a new cue at a new playback time.
   */
  const resetAndSample = (video: HTMLVideoElement): void => {
    resetBuffer();
    sampleCue(video);
  };

  // The coordinator clears its isolated-world overlay after a debounced seek
  // reset. Re-seed the source after that clear so a paused/repeated caption is
  // not lost when no further DOM mutation occurs.
  const cleanupSeekResetMessage = onMessage('SUBTITLE_SEEK_RESET', () => {
    if (attached) {
      resetAndSample(attached.video);
    } else {
      resetBuffer();
    }
  });

  /** Attach the cue observer to a video + caption-overlay pair. Idempotent. */
  const attach = (video: HTMLVideoElement, rootEl: HTMLElement) => {
    // Detach any prior attachment (e.g. player re-mounted).
    detach();

    const observer = new MutationObserver(
      debounce(() => {
        // The root/video may have been swapped by the player between the
        // mutation and this debounced tick — validate before sampling so cues
        // are read from the element that is live now.
        if (!ensureAttached()) return;
        if (attached) sampleCue(attached.video);
      }, 50),
    );
    observer.observe(rootEl, { childList: true, subtree: true, characterData: true });

    // MAX-7: pausing must NOT close the open cue. Capping it at the pause time
    // would make the still-visible line unmatchable (no active cue → the
    // overlay blanks) until the player renders a caption at a *later* time.
    // The cue now stays open with the sentinel until the next text change.
    const pauseHandler = () => {
      emit(domSource.readActiveLanguage(), domSource.videoIdExtractor?.());
    };
    video.addEventListener('pause', pauseHandler);

    // Resume: sample once in case the caption changed while paused.
    const playHandler = () => {
      sampleCue(video);
    };
    video.addEventListener('play', playHandler);

    // A seek starts a new timeline. Retaining the old open cue would leave
    // stale cues in the rolling buffer and, after a backward seek, append cues
    // out of start-time order. The overlay uses binary search, so discard the
    // old buffer and sample the destination immediately instead.
    const seekedHandler = () => {
      resetAndSample(video);
    };
    video.addEventListener('seeked', seekedHandler);

    // `emptied` (src swap / player teardown) and `loadstart` (new media load)
    // both start a new timeline — an ad break or the next episode reuses the
    // same <video> element, so the previous title's cues must not linger.
    const emptiedHandler = () => {
      resetAndSample(video);
    };
    const loadstartHandler = () => {
      resetAndSample(video);
    };
    video.addEventListener('emptied', emptiedHandler);
    video.addEventListener('loadstart', loadstartHandler);

    attached = { observer, video, rootEl, pauseHandler, playHandler, seekedHandler, emptiedHandler, loadstartHandler };
    // Sample once in case a cue is already showing.
    sampleCue(video);
  };

  const detach = () => {
    if (!attached) return;
    attached.observer.disconnect();
    attached.video.removeEventListener('pause', attached.pauseHandler);
    attached.video.removeEventListener('play', attached.playHandler);
    attached.video.removeEventListener('seeked', attached.seekedHandler);
    attached.video.removeEventListener('emptied', attached.emptiedHandler);
    attached.video.removeEventListener('loadstart', attached.loadstartHandler);
    attached = null;
  };

  /**
   * Validate the current attachment and re-attach when a dependency changed.
   *
   * Max's React player re-mounts the caption overlay on quality/menu changes
   * and can replace the <video> element on DRM/ads re-init. A disconnected root
   * or a different primary video means the observer is watching a dead node —
   * drop it and bind to the live ones. Returns true when an attachment exists.
   */
  const ensureAttached = (): boolean => {
    const stillValid =
      attached !== null &&
      attached.rootEl.isConnected &&
      attached.video.isConnected &&
      findPrimaryVideo() === attached.video;
    if (attached && !stillValid) detach();
    if (attached) return true;

    const video = findPrimaryVideo();
    const rootEl = document.querySelector<HTMLElement>(domSource.observeRootSelector);
    if (!video || !rootEl) return false;
    attach(video, rootEl);
    return true;
  };

  /** Reset the rolling buffer to a fresh timeline and sample the live position. */
  const resetAndSampleCurrent = (): void => {
    if (!ensureAttached() || !attached) {
      resetBuffer();
      return;
    }
    resetAndSample(attached.video);
  };

  // SPA navigation: the coordinator resets the MAIN-world capture tiers when the
  // route changes. The caption renderer is re-created per title, so drop the
  // old attachment/buffer and bind to whatever the new page exposes.
  const cleanupCaptureResetMessage = onMessage('SUBTITLE_CAPTURE_RESET', () => {
    console.log(`[AnyLLMTranslate] ${handler.platform} capture reset — clearing DOM cue buffer`);
    resetBuffer();
    detach();
    resetAndSampleCurrent();
  });

  // Watch for dynamically inserted video / caption-overlay nodes (Max's React
  // player mounts after DOMContentLoaded). Re-evaluate on each added subtree.
  const documentObserver = new MutationObserver(
    debounce(() => {
      if (ensureAttached() && attached) sampleCue(attached.video);
    }, 50),
  );
  documentObserver.observe(document.documentElement, { childList: true, subtree: true });

  // Initial attempt (dependencies may already be present at startup).
  ensureAttached();

  // Reset the rolling buffer when the user switches the platform's subtitle
  // track mid-session (a different track's cues are unrelated to the prior
  // buffer). The selector + activation attribute are platform-specific and
  // come from the DomCueSource contract — e.g. HBO Max watches aria-checked on
  // [data-testid="player-ux-text-track-button"]; Youku watches aria-selected
  // on [com="subtitle"] [data-val]. When no selector is configured, track-switch
  // detection is skipped entirely (cue text still updates via the main observer).
  let trackObserver: MutationObserver | null = null;
  const trackSwitchSelector = domSource.trackSwitchSelector;
  if (trackSwitchSelector) {
    const trackAttr = domSource.trackSwitchAttribute ?? 'aria-checked';
    trackObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type !== 'attributes' || m.attributeName !== trackAttr) continue;
        const target = m.target as HTMLElement;
        if (typeof target.matches !== 'function') continue;
        // matches() handles descendant combinators (e.g. Youku's
        // `[com="subtitle"] [data-val]`), so one selector covers both the
        // button itself (HBO Max) and picker items nested in a panel (Youku).
        if (target.matches(trackSwitchSelector) && target.getAttribute(trackAttr) === 'true') {
          console.log(`[AnyLLMTranslate] ${handler.platform} subtitle track changed — resetting DOM cue buffer`);
          resetBuffer();
          resetMaxVttPerformanceCaptureLock();
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
      attributeFilter: [trackAttr],
    });
  }

  return () => {
    cleanupSeekResetMessage();
    cleanupCaptureResetMessage();
    documentObserver.disconnect();
    trackObserver?.disconnect();
    detach();
  };
}
