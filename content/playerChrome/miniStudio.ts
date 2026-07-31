/**
 * On-player mini studio panel — richer subtitle controls in shadow DOM.
 */

import type { ProfileKnobs } from '@/lib/subtitleProfiles';
import { PLAYER_CHROME_PANEL_CLASS } from './types';
import type { MiniStudioSnapshot } from './prefs';
import {
  hydrateLocalKnobs,
  loadMiniStudioSnapshot,
  setActiveGlossaryList,
  setAppearance,
  setSubtitlesEnabled,
  setTabKnob,
} from './prefs';

const PANEL_CSS = `
.${PLAYER_CHROME_PANEL_CLASS} {
  pointer-events: auto;
  width: 280px;
  max-height: min(70vh, 420px);
  overflow: auto;
  box-sizing: border-box;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(63,63,70,0.9);
  background: rgba(9,9,11,0.94);
  color: #e4e4e7;
  box-shadow: 0 12px 40px rgba(0,0,0,0.45);
  font: 12px/1.4 system-ui, -apple-system, sans-serif;
}
.${PLAYER_CHROME_PANEL_CLASS}[hidden] { display: none !important; }
.${PLAYER_CHROME_PANEL_CLASS} h2 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: #fafafa;
}
.${PLAYER_CHROME_PANEL_CLASS} .row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}
.${PLAYER_CHROME_PANEL_CLASS} .row-inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.${PLAYER_CHROME_PANEL_CLASS} label {
  color: #a1a1aa;
  font-size: 11px;
  font-weight: 500;
}
.${PLAYER_CHROME_PANEL_CLASS} select,
.${PLAYER_CHROME_PANEL_CLASS} input[type="range"] {
  width: 100%;
  box-sizing: border-box;
}
.${PLAYER_CHROME_PANEL_CLASS} select {
  background: #18181b;
  color: #e4e4e7;
  border: 1px solid #3f3f46;
  border-radius: 8px;
  padding: 6px 8px;
}
.${PLAYER_CHROME_PANEL_CLASS} .knobs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}
.${PLAYER_CHROME_PANEL_CLASS} .status {
  min-height: 16px;
  color: #67e8f9;
  font-size: 11px;
  margin-bottom: 10px;
}
.${PLAYER_CHROME_PANEL_CLASS} .footer-btn {
  width: 100%;
  pointer-events: auto;
  border: 1px solid #3f3f46;
  background: #27272a;
  color: #f4f4f5;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  font: 600 11px/1 system-ui, sans-serif;
}
.${PLAYER_CHROME_PANEL_CLASS} .footer-btn:hover {
  border-color: #0ea5e9;
  color: #fff;
}
.${PLAYER_CHROME_PANEL_CLASS} input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: #0ea5e9;
}
`;

const KNOB_OPTIONS: { knob: keyof ProfileKnobs; opts: string[] }[] = [
  { knob: 'faithfulness', opts: ['auto', 'literal', 'balanced', 'idiomatic'] },
  { knob: 'brevity', opts: ['auto', 'relaxed', 'moderate', 'terse'] },
  { knob: 'register', opts: ['auto', 'formal', 'neutral', 'casual'] },
  { knob: 'profanity', opts: ['auto', 'preserve', 'soften', 'remove'] },
];

const STATUS_LABEL: Record<string, string> = {
  idle: 'Ready',
  waiting: 'Waiting for captions…',
  translating: 'Translating…',
  error: 'Translation error',
  disabled: 'Subtitles off',
};

export interface MiniStudioControllers {
  open(): Promise<void>;
  close(): void;
  isOpen(): boolean;
  refresh(): Promise<void>;
  destroy(): void;
}

function openFullSubtitleStudio(): void {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      void chrome.runtime.openOptionsPage();
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    const url = chrome.runtime.getURL('options.html');
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    /* ignore */
  }
}

function fillSelect(select: HTMLSelectElement, values: string[], current: string): void {
  select.innerHTML = '';
  for (const value of values) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  }
  select.value = values.includes(current) ? current : values[0] ?? '';
}

export function attachMiniStudio(args: {
  shadow: ShadowRoot;
  anchorButton: HTMLButtonElement;
  panelSlot?: HTMLElement | null;
  onOpenChange: (open: boolean) => void;
}): MiniStudioControllers {
  const style = document.createElement('style');
  style.setAttribute('data-anyllm-mini-studio', '1');
  style.textContent = PANEL_CSS;

  const panel = document.createElement('div');
  panel.className = PLAYER_CHROME_PANEL_CLASS;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Subtitle mini studio');
  panel.hidden = true;
  panel.innerHTML = `
    <h2>Subtitle studio</h2>
    <div class="row-inline">
      <label for="anyllm-ms-enable">Enable subtitles</label>
      <input id="anyllm-ms-enable" data-action="enable" type="checkbox" />
    </div>
    <div class="row">
      <label for="anyllm-ms-display">Display</label>
      <select id="anyllm-ms-display" data-action="displayMode">
        <option value="bilingual">Bilingual</option>
        <option value="translation-only">Translation only</option>
      </select>
    </div>
    <div class="row">
      <label for="anyllm-ms-font">Font size <span data-role="fontValue">18</span>px</label>
      <input id="anyllm-ms-font" data-action="fontSize" type="range" min="12" max="36" step="1" />
    </div>
    <div class="row">
      <label for="anyllm-ms-position">Position</label>
      <select id="anyllm-ms-position" data-action="position">
        <option value="bottom">Bottom</option>
        <option value="top">Top</option>
      </select>
    </div>
    <div class="row">
      <label for="anyllm-ms-opacity">Background <span data-role="opacityValue">70</span>%</label>
      <input id="anyllm-ms-opacity" data-action="opacity" type="range" min="0" max="100" step="5" />
    </div>
    <div class="knobs" data-role="knobs"></div>
    <div class="row">
      <label for="anyllm-ms-list">Glossary list</label>
      <select id="anyllm-ms-list" data-action="glossary"></select>
    </div>
    <div class="status" data-role="status" aria-live="polite"></div>
    <button type="button" class="footer-btn" data-action="open-options">Open full Subtitle Studio</button>
  `;

  const parent = args.panelSlot ?? args.shadow;
  parent.append(style, panel);

  const knobsRoot = panel.querySelector('[data-role="knobs"]') as HTMLElement;
  for (const { knob, opts } of KNOB_OPTIONS) {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('label');
    label.textContent = knob;
    label.htmlFor = `anyllm-ms-knob-${knob}`;
    const select = document.createElement('select');
    select.id = `anyllm-ms-knob-${knob}`;
    select.dataset.action = 'knob';
    select.dataset.knob = knob;
    fillSelect(select, opts, 'auto');
    row.append(label, select);
    knobsRoot.appendChild(row);
  }

  let open = false;
  let destroyed = false;

  const enableEl = panel.querySelector('[data-action="enable"]') as HTMLInputElement;
  const displayEl = panel.querySelector('[data-action="displayMode"]') as HTMLSelectElement;
  const fontEl = panel.querySelector('[data-action="fontSize"]') as HTMLInputElement;
  const fontValueEl = panel.querySelector('[data-role="fontValue"]') as HTMLElement;
  const positionEl = panel.querySelector('[data-action="position"]') as HTMLSelectElement;
  const opacityEl = panel.querySelector('[data-action="opacity"]') as HTMLInputElement;
  const opacityValueEl = panel.querySelector('[data-role="opacityValue"]') as HTMLElement;
  const glossaryEl = panel.querySelector('[data-action="glossary"]') as HTMLSelectElement;
  const statusEl = panel.querySelector('[data-role="status"]') as HTMLElement;
  const optionsBtn = panel.querySelector('[data-action="open-options"]') as HTMLButtonElement;

  function applySnapshot(snap: MiniStudioSnapshot): void {
    enableEl.checked = snap.enabled;
    displayEl.value = snap.displayMode;
    fontEl.value = String(snap.fontSize);
    fontValueEl.textContent = String(snap.fontSize);
    positionEl.value = snap.position;
    const pct = Math.round(snap.backgroundOpacity * 100);
    opacityEl.value = String(pct);
    opacityValueEl.textContent = String(pct);
    hydrateLocalKnobs(snap.knobs);
    for (const select of panel.querySelectorAll<HTMLSelectElement>('select[data-action="knob"]')) {
      const knob = select.dataset.knob as keyof ProfileKnobs;
      const current = snap.knobs[knob];
      select.value = current ?? 'auto';
    }
    glossaryEl.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'None';
    glossaryEl.appendChild(none);
    for (const list of snap.lists) {
      const opt = document.createElement('option');
      opt.value = list.id;
      opt.textContent = list.name;
      glossaryEl.appendChild(opt);
    }
    glossaryEl.value = snap.activeListId ?? '';
    statusEl.textContent = STATUS_LABEL[snap.status] ?? snap.status;
  }

  async function refresh(): Promise<void> {
    if (destroyed) return;
    const snap = await loadMiniStudioSnapshot();
    if (destroyed) return;
    applySnapshot(snap);
  }

  async function openPanel(): Promise<void> {
    if (destroyed || open) return;
    open = true;
    panel.hidden = false;
    args.onOpenChange(true);
    await refresh();
  }

  function closePanel(): void {
    if (destroyed || !open) return;
    open = false;
    panel.hidden = true;
    args.onOpenChange(false);
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePanel();
    }
  };

  const onPointerDown = (e: Event): void => {
    if (!open) return;
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    if (path.includes(panel) || path.includes(args.anchorButton)) return;
    closePanel();
  };

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('pointerdown', onPointerDown, true);

  enableEl.addEventListener('change', () => {
    void setSubtitlesEnabled(enableEl.checked).then(() => refresh());
  });
  displayEl.addEventListener('change', () => {
    void setAppearance({
      displayMode: displayEl.value as MiniStudioSnapshot['displayMode'],
    }).then(() => refresh());
  });
  fontEl.addEventListener('input', () => {
    fontValueEl.textContent = fontEl.value;
  });
  fontEl.addEventListener('change', () => {
    void setAppearance({ fontSize: Number(fontEl.value) }).then(() => refresh());
  });
  positionEl.addEventListener('change', () => {
    void setAppearance({
      position: positionEl.value as MiniStudioSnapshot['position'],
    }).then(() => refresh());
  });
  opacityEl.addEventListener('input', () => {
    opacityValueEl.textContent = opacityEl.value;
  });
  opacityEl.addEventListener('change', () => {
    void setAppearance({ backgroundOpacity: Number(opacityEl.value) / 100 }).then(() =>
      refresh(),
    );
  });
  glossaryEl.addEventListener('change', () => {
    const id = glossaryEl.value || null;
    void setActiveGlossaryList(id).then(() => refresh());
  });
  optionsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openFullSubtitleStudio();
  });

  for (const select of panel.querySelectorAll<HTMLSelectElement>('select[data-action="knob"]')) {
    select.addEventListener('change', () => {
      const knob = select.dataset.knob as keyof ProfileKnobs;
      setTabKnob(knob, select.value);
      void refresh();
    });
  }

  return {
    open: openPanel,
    close: closePanel,
    isOpen: () => open,
    refresh,
    destroy() {
      destroyed = true;
      open = false;
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      panel.remove();
      style.remove();
    },
  };
}
