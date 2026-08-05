import { findPrimaryVideo } from '@/lib/findPrimaryVideo';
import { getPlayerChromeAdapter } from './adapters/registry';
import type { PlayerChromeAdapter } from './adapters/types';

export function resolvePlayerTargets(doc: Document = document): {
  video: HTMLVideoElement | null;
  playerRoot: HTMLElement | null;
  adapter: PlayerChromeAdapter | null;
} {
  const hostname =
    doc.defaultView?.location.hostname ??
    (typeof location !== 'undefined' ? location.hostname : '');
  const adapter = getPlayerChromeAdapter(hostname);
  const video = findPrimaryVideo(doc);
  let playerRoot: HTMLElement | null = null;
  if (adapter?.findPlayerRoot) {
    playerRoot = adapter.findPlayerRoot(doc);
  }
  if (!playerRoot && video) {
    playerRoot =
      (video.closest('.html5-video-player, .video-js, [class*="player"]') as HTMLElement | null) ??
      (video.parentElement as HTMLElement | null) ??
      video;
  }
  return { video, playerRoot, adapter };
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
};

export function getActiveFullscreenElement(doc: Document = document): Element | null {
  const d = doc as FullscreenDocument;
  return (
    doc.fullscreenElement ??
    d.webkitFullscreenElement ??
    d.mozFullScreenElement ??
    d.msFullscreenElement ??
    null
  );
}

/** Container fullscreen parent suitable for appending chrome; null if none or bare video. */
export function getFullscreenMountParent(doc: Document = document): Element | null {
  const el = getActiveFullscreenElement(doc);
  if (!el) return null;
  if (el instanceof HTMLVideoElement) return null;
  return el;
}

/**
 * A native control-bar candidate must actually occupy the player's bottom
 * control band. Some site variants (e.g. Coursera) expose player-root or
 * top-bar lookalikes under loose selectors; appending there would strand the
 * button in the wrong corner. Falls back to floating when geometry is unknown
 * (player not laid out yet — trust the selector rather than dropping native
 * mounts on dynamically mounting players).
 */
export function isPlausibleControlBar(node: HTMLElement, video: HTMLVideoElement): boolean {
  if (!node.isConnected) return false;
  const vr = video.getBoundingClientRect();
  if (vr.width < 80 || vr.height < 80) return true;
  const r = node.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  return (
    r.height <= vr.height * 0.35 &&
    r.top >= vr.top + vr.height * 0.5 &&
    r.bottom >= vr.bottom - 8 &&
    r.bottom <= vr.bottom + 16
  );
}
