import { PLAYER_CHROME_BUTTON_CLASS } from './types';

export function createChromeButton(onToggle: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = PLAYER_CHROME_BUTTON_CLASS;
  button.setAttribute('aria-label', 'Subtitle translation settings');
  button.setAttribute('aria-expanded', 'false');
  button.title = 'AnyLLMTranslate subtitles';
  button.textContent = 'A⇄';
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle();
  });
  return button;
}
