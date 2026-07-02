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
  ): Promise<void>;
  updateCues(cues: SubtitleCue[]): void;
  destroy(): void;
}

/** Legacy custom-overlay renderer (fallback). Wraps the existing overlay module. */
export class OverlayRenderer implements SubtitleRenderer {
  async initialize(
    cues: SubtitleCue[],
    config: SubtitleDisplayConfig,
    video: HTMLVideoElement,
  ): Promise<void> {
    initializeOverlay(cues, config, video);
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
 * Returns a native renderer if supported, else the overlay fallback.
 *
 * Native branch is added in Task 7; for now (Task 6) this always returns the
 * overlay renderer so the coordinator can be migrated onto the interface first.
 */
export function createRenderer(video: HTMLVideoElement): SubtitleRenderer {
  // Task 7: if (canRenderNatively(video)) return new NativeTrackRenderer();
  return new OverlayRenderer();
}
