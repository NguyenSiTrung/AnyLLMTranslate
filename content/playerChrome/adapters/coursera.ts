import type { PlayerChromeAdapter } from './types';

/**
 * Best-effort Coursera control-bar mount. If selectors miss, floating chrome
 * remains the product path.
 */
export const courseraPlayerChromeAdapter: PlayerChromeAdapter = {
  id: 'coursera',
  match(hostname) {
    const h = hostname.toLowerCase();
    return h === 'coursera.org' || h.endsWith('.coursera.org');
  },
  findNativeMount(doc) {
    return (
      doc.querySelector<HTMLElement>('.rc-VideoControlsContainer') ??
      doc.querySelector<HTMLElement>('[data-testid="video-player-controls"]') ??
      doc.querySelector<HTMLElement>('[class*="video-controls"]')
    );
  },
  findPlayerRoot(doc) {
    return (
      doc.querySelector<HTMLElement>('.rc-VideoHighlightingManager') ??
      doc.querySelector<HTMLElement>('[data-testid="video-player"]') ??
      doc.querySelector<HTMLElement>('.video-main-player-container')
    );
  },
};

