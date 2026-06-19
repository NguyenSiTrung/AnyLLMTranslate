/**
 * DOM Cue Source — scrapes platform-rendered captions from the DOM.
 *
 * For platforms (e.g. HBO Max) that render captions themselves instead of
 * exposing a VTT URL or native TextTrack. Observes a stable ancestor and
 * samples video.currentTime on each cue-text change to derive cue timing.
 *
 * Mirrors textTrackDiscovery.ts shape: returns a cleanup function.
 */

import type { MessageBridgeSender } from '@/inject/messageBridge';
import type { SubtitleHandler } from '@/inject/subtitleHandlers/registry';
import type { SubtitleCue, SubtitleDomCuesPayload } from '@/types/subtitle';

/**
 * Start observing the page for DOM-rendered captions.
 * Emits SUBTITLE_DOM_CUES messages with a rolling SubtitleCue[].
 * Returns a cleanup function. Returns a no-op cleanup when the handler
 * exposes no DOM cue source, or when no video / observe root is present.
 */
export function startDomCueSource(handler: SubtitleHandler, bridge: MessageBridgeSender): () => void {
  const domSource = handler.getDomCueSource?.();
  if (!domSource) return () => {};

  const video = findPrimaryVideo();
  if (!video) return () => {};

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
    const payload: SubtitleDomCuesPayload = {
      cues: [...cues],
      platform: handler.platform,
      language,
      videoId,
    };
    bridge.send('SUBTITLE_DOM_CUES', payload);
  };

  const sampleCue = () => {
    const cueEl = document.querySelector<HTMLElement>(domSource.cueSelector);
    const text = cueEl?.textContent?.trim() ?? '';
    if (!text || text === lastText) return;

    const t = video.currentTime;
    // Close previous open cue at the new cue's start time.
    if (openCue) {
      openCue.endTime = t;
      openCue = null;
    }

    const cue: SubtitleCue = { startTime: t, endTime: t, text };
    cues.push(cue);
    openCue = cue;
    lastText = text;

    emit(domSource.readActiveLanguage(), extractVideoId());
  };

  const rootEl = document.querySelector<HTMLElement>(domSource.observeRootSelector);
  if (!rootEl) return () => {};

  const observer = new MutationObserver(() => {
    sampleCue();
  });
  observer.observe(rootEl, { childList: true, subtree: true, characterData: true });

  // Reset the rolling buffer when the user switches Max's subtitle track
  // mid-session (a different track's cues are unrelated to the prior buffer).
  const trackObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type !== 'attributes' || m.attributeName !== 'aria-checked') continue;
      const target = m.target as HTMLElement;
      if (target.getAttribute('aria-checked') === 'true') {
        console.log('[AnyLLMTranslate] Max subtitle track changed — resetting DOM cue buffer');
        resetBuffer();
        return;
      }
    }
  });
  // Observe the document for aria-checked changes on track buttons.
  // Track buttons may not exist yet at start; observe documentElement and filter.
  trackObserver.observe(document.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ['aria-checked'],
  });

  // Cap dangling open cue when video pauses without a cue change.
  const pauseHandler = () => {
    if (openCue) {
      openCue.endTime = video.currentTime;
      emit(domSource.readActiveLanguage(), extractVideoId());
    }
  };
  video.addEventListener('pause', pauseHandler);

  return () => {
    observer.disconnect();
    trackObserver.disconnect();
    video.removeEventListener('pause', pauseHandler);
  };
}

function findPrimaryVideo(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
  if (videos.length === 0) return null;
  if (videos.length === 1) return videos[0];
  const scored = videos
    .map((v) => {
      const rect = v.getBoundingClientRect();
      return { video: v, score: rect.width * rect.height };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.video ?? null;
}

function extractVideoId(): string | undefined {
  const match = window.location.pathname.match(/\/video\/watch\/([^/]+)/);
  return match?.[1];
}