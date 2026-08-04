/**
 * Subtitle renderer abstraction.
 *
 * The coordinator calls createRenderer(video) and gets back an object whose
 * implementation is either native HTML5 TextTrack (preferred — the browser
 * handles timing/fullscreen/positioning) or the legacy custom overlay (fallback
 * when the browser/player lacks TextTrack support; spec decision D3).
 *
 * Task 6 ships the interface, the OverlayRenderer adapter, and a factory that
 * currently always returns OverlayRenderer. Task 7 adds NativeTrackRenderer and
 * wires the native branch into createRenderer.
 */
import type { SubtitleCue } from '@/types/subtitle';
import {
  initializeOverlay,
  updateCues,
  cleanup as cleanupOverlay,
} from '@/content/subtitleOverlay';
// NativeTrackRenderer is intentionally not imported until createRenderer can
// safely suppress player-owned native tracks (see createRenderer note below).

export interface SubtitleDisplayConfig {
  displayMode?: 'bilingual' | 'translation-only';
  fontSizeMode?: 'auto' | 'fixed';
  /** Mirror of the overlay-relevant OverlayConfig fields; passed through. */
  [key: string]: unknown;
}

export interface SubtitleRenderer {
  initialize(
    cues: SubtitleCue[],
    config: SubtitleDisplayConfig,
    video: HTMLVideoElement,
  ): Promise<boolean>;
  updateCues(cues: SubtitleCue[]): void;
  destroy(): void;
}

/** Legacy custom-overlay renderer (fallback). Wraps the existing overlay module. */
export class OverlayRenderer implements SubtitleRenderer {
  async initialize(
    cues: SubtitleCue[],
    config: SubtitleDisplayConfig,
    video: HTMLVideoElement,
  ): Promise<boolean> {
    return initializeOverlay(cues, config, video);
  }

  updateCues(cues: SubtitleCue[]): void {
    updateCues(cues);
  }

  destroy(): void {
    cleanupOverlay();
  }
}

/** Whether the environment can render subtitles via native TextTrack. */
export function canRenderNatively(video: HTMLVideoElement): boolean {
  return (
    typeof VTTCue !== 'undefined' &&
    typeof video.addTextTrack === 'function'
  );
}

/**
 * Returns a native renderer if supported, else the overlay fallback (D3).
 *
 * NOTE: native rendering is currently DISABLED. Real players (e.g. HBO Max)
 * populate their own native <video>.textTracks with cues; creating additional
 * synthetic tracks stacks on top of theirs and the legacy hideNativeCaptions
 * CSS cannot hide native-track rendering (it only hides the DOM caption window).
 * The result was duplicated original-language lines. Until the coordinator can
 * detect and suppress/hide the player's own native tracks, we always use the
 * overlay, which the existing hideNativeCaptions path correctly controls.
 *
 * Probe 3 (spec Phase 0) confirmed Max populates native textTracks.
 */
export function createRenderer(video: HTMLVideoElement): SubtitleRenderer {
  // Intentionally always overlay for now:
  // if (canRenderNatively(video)) return new NativeTrackRenderer();
  void video;
  return new OverlayRenderer();
}
