import type { PlayerChromeAdapter } from './types';

export const youtubePlayerChromeAdapter: PlayerChromeAdapter = {
  id: 'youtube',
  match(hostname) {
    const h = hostname.toLowerCase();
    return (
      h === 'youtu.be' ||
      h === 'youtube.com' ||
      h.endsWith('.youtube.com') ||
      h === 'youtube-nocookie.com' ||
      h.endsWith('.youtube-nocookie.com')
    );
  },
  findNativeMount(doc) {
    return (
      doc.querySelector<HTMLElement>('.ytp-right-controls') ??
      doc.querySelector<HTMLElement>('.ytp-chrome-controls .ytp-right-controls')
    );
  },
  findPlayerRoot(doc) {
    return doc.querySelector<HTMLElement>('.html5-video-player');
  },
  isControlsVisible(doc) {
    const player = this.findPlayerRoot?.(doc);
    if (!player) return null;
    if (player.classList.contains('ytp-autohide')) return false;
    return true;
  },
};
