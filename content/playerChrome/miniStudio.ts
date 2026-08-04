/**
 * On-player mini studio panel — glass UI, sectioned layout, live preview.
 * Presentation rewired onto miniStudioView; all writes still flow through prefs.ts.
 */

import type { ProfileKnobs } from '@/lib/subtitleProfiles';
import { onSettingsChange } from '@/lib/config';
import { isContextInvalidated } from '@/lib/utils';
import type { ChromeButtonState } from './button';
import type { MiniStudioSnapshot } from './prefs';
import {
  hydrateLocalKnobs,
  loadMiniStudioSnapshot,
  setActiveGlossaryList,
  setAppearance,
  setSubtitlesEnabled,
  setTabKnob,
} from './prefs';
import {
  buildMiniStudioView,
  setStatusPill,
  updatePreview,
  type MiniStudioView,
} from './miniStudioView';

export interface MiniStudioControllers {
  open(): Promise<void>;
  close(): void;
  isOpen(): boolean;
  refresh(): Promise<void>;
  destroy(): void;
}

/** Slightly longer than the 160ms panel transition so the close fade completes
 *  before `hidden` is applied. */
const CLOSE_HIDE_MS = 170;

function openFullSubtitleStudio(): void {
  let url: string;
  try {
    // Deep-link straight to the Subtitles section (the Subtitle Studio) so the
    // options page opens there, not on the default General tab.
    url = chrome.runtime.getURL('options.html?section=subtitles');
  } catch {
    return; // no extension context
  }
  try {
    // Route through the background, which uses chrome.tabs.create — that reliably
    // renders the extension page. window.open-ing a chrome-extension:// URL from a
    // content script opens a blank (about:blank) tab for non-web-accessible pages,
    // so we avoid it here.
    chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS', url }).catch(() => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
          void chrome.runtime.openOptionsPage();
        }
      } catch {
        /* ignore */
      }
    });
  } catch {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
        void chrome.runtime.openOptionsPage();
      }
    } catch {
      /* ignore */
    }
  }
}

function buttonStateFromSnapshot(snap: MiniStudioSnapshot): ChromeButtonState {
  if (!snap.enabled) return 'off';
  return snap.status === 'translating' ? 'translating' : 'enabled';
}

export function attachMiniStudio(args: {
  shadow: ShadowRoot;
  anchorButton: HTMLButtonElement;
  panelSlot?: HTMLElement | null;
  onOpenChange: (open: boolean) => void;
  setButtonState?: (state: ChromeButtonState) => void;
}): MiniStudioControllers {
  const view: MiniStudioView = buildMiniStudioView();
  const panel = view.panel;

  const parent = args.panelSlot ?? args.shadow;
  parent.append(view.style, panel);

  let open = false;
  let destroyed = false;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  function currentPreviewArgs(): {
    fontSize: number;
    backgroundOpacity: number;
    position: 'top' | 'bottom';
    displayMode: string;
  } {
    return {
      fontSize: Number(view.fontSize.input.value),
      backgroundOpacity: Number(view.opacity.input.value) / 100,
      position: view.position.value() as 'top' | 'bottom',
      displayMode: view.displayMode.value(),
    };
  }

  function applySnapshot(snap: MiniStudioSnapshot): void {
    view.enable.input.checked = snap.enabled;
    view.displayMode.setValue(snap.displayMode);
    view.fontSize.setValue(snap.fontSize);
    view.fontValue.textContent = String(snap.fontSize);
    view.position.setValue(snap.position);
    const pct = Math.round(snap.backgroundOpacity * 100);
    view.opacity.setValue(pct);
    view.opacityValue.textContent = String(pct);
    hydrateLocalKnobs(snap.knobs);
    for (const select of view.knobSelects) {
      const knob = select.dataset.knob as keyof ProfileKnobs;
      select.value = snap.knobs[knob] ?? 'auto';
    }
    view.glossary.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'None';
    view.glossary.appendChild(none);
    for (const list of snap.lists) {
      const opt = document.createElement('option');
      opt.value = list.id;
      opt.textContent = list.name;
      view.glossary.appendChild(opt);
    }
    view.glossary.value = snap.activeListId ?? '';
    setStatusPill(view.statusPill, view.statusLabel, snap.status);
    updatePreview(view.preview, {
      fontSize: snap.fontSize,
      backgroundOpacity: snap.backgroundOpacity,
      position: snap.position,
      displayMode: snap.displayMode,
    });
    args.setButtonState?.(buttonStateFromSnapshot(snap));
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
    if (closeTimer != null) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    panel.hidden = false;
    // Next frame so the open transition actually runs from the initial state.
    requestAnimationFrame(() => {
      if (open && !destroyed) panel.classList.add('open');
    });
    args.onOpenChange(true);
    await refresh();
  }

  function closePanel(): void {
    if (destroyed || !open) return;
    open = false;
    panel.classList.remove('open');
    closeTimer = setTimeout(() => {
      closeTimer = null;
      if (!open && !destroyed) panel.hidden = true;
    }, CLOSE_HIDE_MS);
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

  // Keep the anchor button state (and an open panel) in sync with external
  // settings writes (popup/options). Event-driven — no polling.
  let unsubscribeSettings: (() => void) | null = null;
  if (!isContextInvalidated()) {
    try {
      unsubscribeSettings = onSettingsChange(() => {
        if (!destroyed) void refresh();
      });
    } catch {
      /* no extension context */
    }
  }

  view.enable.input.addEventListener('change', () => {
    void setSubtitlesEnabled(view.enable.input.checked).then(() => refresh());
  });
  for (const input of view.displayMode.inputs) {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      void setAppearance({
        displayMode: input.value as MiniStudioSnapshot['displayMode'],
      }).then(() => refresh());
    });
  }
  view.fontSize.input.addEventListener('input', () => {
    view.fontValue.textContent = view.fontSize.input.value;
    updatePreview(view.preview, currentPreviewArgs());
  });
  view.fontSize.input.addEventListener('change', () => {
    void setAppearance({ fontSize: Number(view.fontSize.input.value) }).then(() => refresh());
  });
  for (const input of view.position.inputs) {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      void setAppearance({
        position: input.value as MiniStudioSnapshot['position'],
      }).then(() => refresh());
    });
  }
  view.opacity.input.addEventListener('input', () => {
    view.opacityValue.textContent = view.opacity.input.value;
    updatePreview(view.preview, currentPreviewArgs());
  });
  view.opacity.input.addEventListener('change', () => {
    void setAppearance({ backgroundOpacity: Number(view.opacity.input.value) / 100 }).then(() =>
      refresh(),
    );
  });
  view.glossary.addEventListener('change', () => {
    const id = view.glossary.value || null;
    void setActiveGlossaryList(id).then(() => refresh());
  });
  view.optionsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openFullSubtitleStudio();
  });
  view.closeBtn.addEventListener('click', () => {
    closePanel();
  });

  for (const select of view.knobSelects) {
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
      if (closeTimer != null) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      unsubscribeSettings?.();
      unsubscribeSettings = null;
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      panel.remove();
      view.style.remove();
    },
  };
}
