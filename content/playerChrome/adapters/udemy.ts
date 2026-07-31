import type { PlayerChromeAdapter } from './types';

/**
 * Best-effort Udemy control-bar mount. If selectors miss, findNativeMount
 * returns null and floating chrome remains active.
 */
export const udemyPlayerChromeAdapter: PlayerChromeAdapter = {
  id: 'udemy',
  match(hostname) {
    const h = hostname.toLowerCase();
    return h === 'udemy.com' || h.endsWith('.udemy.com');
  },
  findNativeMount(doc) {
    return (
      doc.querySelector<HTMLElement>('[data-purpose="video-controls"]') ??
      doc.querySelector<HTMLElement>('.video-control-bar') ??
      doc.querySelector<HTMLElement>('[class*="control-bar"]')
    );
  },
  findPlayerRoot(doc) {
    return (
      doc.querySelector<HTMLElement>('[data-purpose="curriculum-item-viewer-content"]') ??
      doc.querySelector<HTMLElement>('.video-player--container--') ??
      doc.querySelector<HTMLElement>('div[class*="video-player"]')
    );
  },
};
