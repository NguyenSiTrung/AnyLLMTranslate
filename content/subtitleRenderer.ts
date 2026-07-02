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
import { NativeTrackRenderer } from '@/content/nativeTrackRenderer';

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
    // The legacy overlay finds its own <video> internally (findVideoElement),
    // so video is accepted to satisfy the interface but intentionally not
    // forwarded — keeps the overlay's 2-arg call contract stable.
    _video: HTMLVideoElement,
  ): Promise<void> {
    initializeOverlay(cues, config);
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
 * Capability is checked per-video: a browser with VTTCue + addTextTrack gets
 * native rendering; otherwise the legacy custom overlay is used.
 */
export function createRenderer(video: HTMLVideoElement): SubtitleRenderer {
  if (canRenderNatively(video)) {
    return new NativeTrackRenderer();
  }
  return new OverlayRenderer();
}
