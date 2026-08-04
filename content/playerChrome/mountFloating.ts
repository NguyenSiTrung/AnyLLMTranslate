import { PLAYER_CHROME_HOST_CLASS, PLAYER_CHROME_BUTTON_CLASS } from './types';
import { createChromeButton, type ChromeButtonState } from './button';

export interface ChromeShell {
  host: HTMLElement;
  shadow: ShadowRoot;
  button: HTMLButtonElement;
  panelSlot: HTMLElement;
  setVisible(visible: boolean): void;
  setExpanded(expanded: boolean): void;
  setButtonState(state: ChromeButtonState): void;
  destroy(): void;
  reposition(): void;
  getMountMode(): 'floating' | 'native';
}

export const CHROME_SHADOW_CSS = `
:host { all: initial; }
.wrap {
  pointer-events: none;
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  font-family: system-ui, -apple-system, sans-serif;
}
.${PLAYER_CHROME_BUTTON_CLASS} {
  pointer-events: auto;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(9,9,11,0.82);
  color: #e4e4e7;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,0.35);
  font: 600 12px/1 system-ui, sans-serif;
}
.${PLAYER_CHROME_BUTTON_CLASS}:hover {
  border-color: #22d3ee;
  color: #fff;
}
.${PLAYER_CHROME_BUTTON_CLASS}:focus-visible {
  outline: 2px solid #22d3ee;
  outline-offset: 2px;
}
.${PLAYER_CHROME_BUTTON_CLASS}[aria-expanded="true"] {
  outline: 2px solid #22d3ee;
  outline-offset: 2px;
}
.panel-slot {
  pointer-events: none;
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
}
.${PLAYER_CHROME_BUTTON_CLASS}[data-state="enabled"] {
  border-color: rgba(34,211,238,0.55);
  color: #67e8f9;
}
.${PLAYER_CHROME_BUTTON_CLASS}[data-state="translating"] {
  border-color: rgba(34,211,238,0.55);
  color: #67e8f9;
  animation: anyllmChromePulse 1.6s ease-in-out infinite;
}
@keyframes anyllmChromePulse {
  0%, 100% { box-shadow: 0 4px 16px rgba(0,0,0,0.35); }
  50% { box-shadow: 0 0 0 4px rgba(34,211,238,0.18), 0 4px 16px rgba(0,0,0,0.35); }
}
@media (prefers-reduced-motion: reduce) {
  .${PLAYER_CHROME_BUTTON_CLASS}[data-state="translating"] { animation: none; }
}
`;

function appendChromeShadow(
  host: HTMLElement,
  onToggle: () => void,
): {
  shadow: ShadowRoot;
  button: HTMLButtonElement;
  panelSlot: HTMLElement;
  setButtonState: (state: ChromeButtonState) => void;
} {
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CHROME_SHADOW_CSS;
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  const panelSlot = document.createElement('div');
  panelSlot.className = 'panel-slot';
  const handle = createChromeButton(onToggle);
  wrap.append(panelSlot, handle.button);
  shadow.append(style, wrap);
  return { shadow, button: handle.button, panelSlot, setButtonState: handle.setState };
}

export function createFloatingShell(args: {
  playerRoot: HTMLElement;
  video: HTMLVideoElement;
  onToggle: () => void;
  mountParent?: Element | null;
}): ChromeShell {
  void args.playerRoot;
  const host = document.createElement('div');
  host.className = PLAYER_CHROME_HOST_CLASS;
  host.dataset.mountMode = 'floating';
  host.style.cssText =
    'position:fixed;z-index:2147483646;pointer-events:none;top:0;left:0;opacity:1;visibility:visible;';
  const { shadow, button, panelSlot, setButtonState } = appendChromeShadow(host, args.onToggle);
  const parent = args.mountParent ?? document.body;
  parent.appendChild(host);

  const reposition = (): void => {
    const rect = args.video.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) {
      host.style.opacity = host.style.visibility === 'hidden' ? '0' : host.style.opacity;
      return;
    }
    const bottom = window.innerHeight - rect.bottom + 48;
    const right = window.innerWidth - rect.right + 12;
    host.style.bottom = `${Math.max(8, bottom)}px`;
    host.style.right = `${Math.max(8, right)}px`;
    host.style.top = 'auto';
    host.style.left = 'auto';
  };
  reposition();

  return {
    host,
    shadow,
    button,
    panelSlot,
    setButtonState,
    getMountMode: () => 'floating',
    setVisible(visible: boolean) {
      host.style.opacity = visible ? '1' : '0';
      host.style.visibility = visible ? 'visible' : 'hidden';
      button.tabIndex = visible ? 0 : -1;
    },
    setExpanded(expanded: boolean) {
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    },
    destroy() {
      host.remove();
    },
    reposition,
  };
}

export function createNativeShell(args: {
  mountNode: HTMLElement;
  onToggle: () => void;
}): ChromeShell {
  const host = document.createElement('div');
  host.className = PLAYER_CHROME_HOST_CLASS;
  host.dataset.mountMode = 'native';
  host.style.cssText =
    'position:relative;display:inline-flex;align-items:center;pointer-events:none;margin-left:4px;z-index:10;';
  const { shadow, button, panelSlot, setButtonState } = appendChromeShadow(host, args.onToggle);
  // Panel opens upward; native bar needs a higher stacking context for the slot.
  panelSlot.style.zIndex = '2147483646';
  args.mountNode.appendChild(host);

  return {
    host,
    shadow,
    button,
    panelSlot,
    setButtonState,
    getMountMode: () => 'native',
    setVisible(visible: boolean) {
      host.style.opacity = visible ? '1' : '0';
      host.style.visibility = visible ? 'visible' : 'hidden';
      button.tabIndex = visible ? 0 : -1;
    },
    setExpanded(expanded: boolean) {
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    },
    destroy() {
      host.remove();
    },
    reposition() {
      /* native bar owns layout */
    },
  };
}
