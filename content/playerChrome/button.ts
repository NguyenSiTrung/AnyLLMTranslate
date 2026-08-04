import { PLAYER_CHROME_BUTTON_CLASS } from './types';

export type ChromeButtonState = 'off' | 'enabled' | 'translating';

export interface ChromeButtonHandle {
  button: HTMLButtonElement;
  setState(state: ChromeButtonState): void;
}

/** Captions glyph — two C arcs inside a rounded frame. */
const BUTTON_ICON_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="3"></rect><path d="M10.5 10.2a2.6 2.6 0 1 0 0 3.6"></path><path d="M17 10.2a2.6 2.6 0 1 0 0 3.6"></path></svg>`;

export function createChromeButton(onToggle: () => void): ChromeButtonHandle {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = PLAYER_CHROME_BUTTON_CLASS;
  button.setAttribute('aria-label', 'Subtitle translation settings');
  button.setAttribute('aria-expanded', 'false');
  button.title = 'AnyLLMTranslate subtitles';
  button.dataset.state = 'off';
  button.innerHTML = BUTTON_ICON_SVG;
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle();
  });
  return {
    button,
    setState(state: ChromeButtonState): void {
      button.dataset.state = state;
    },
  };
}
