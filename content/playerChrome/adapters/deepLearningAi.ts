import type { PlayerChromeAdapter } from './types';

/**
 * Best-effort DeepLearning.AI (VDS/video.dev player) control-bar mount. If
 * selectors miss, findNativeMount returns null and floating chrome is used.
 */
export const deepLearningAiPlayerChromeAdapter: PlayerChromeAdapter = {
  id: 'deeplearningai',
  match(hostname) {
    const h = hostname.toLowerCase();
    return h === 'deeplearning.ai' || h.endsWith('.deeplearning.ai');
  },
  findNativeMount(doc) {
    return (
      doc.querySelector<HTMLElement>('.vds-controls') ??
      doc.querySelector<HTMLElement>('[class*="vds-controls"]') ??
      doc.querySelector<HTMLElement>('.vds-video-layout [role="group"]')
    );
  },
  findPlayerRoot(doc) {
    return (
      doc.querySelector<HTMLElement>('.vds-video-layout') ??
      doc.querySelector<HTMLElement>('[class*="vds-player"]') ??
      doc.querySelector<HTMLElement>('.lesson-video-player')
    );
  },
};
