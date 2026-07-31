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
