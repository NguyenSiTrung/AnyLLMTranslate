/**
 * Visual feedback for inline translation (pulse border + toast + copy panel).
 */
import { focusAndSelectContents } from './writeback';

export const PULSING_CLASS = 'anyllm-inline-translating';
export const TOAST_CLASS = 'anyllm-inline-toast';
export const COPY_PANEL_CLASS = 'anyllm-inline-copy-panel';

let activeToast: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let activeCopyPanel: HTMLElement | null = null;
let copyPanelTimer: ReturnType<typeof setTimeout> | null = null;
/** Listeners the panel installs on the composer/document; run on removal. */
let copyPanelCleanup: (() => void) | null = null;

/** Add pulsing border to element */
export function addPulsingBorder(el: HTMLElement): void {
  el.classList.add(PULSING_CLASS);
}

/** Remove pulsing border from element */
export function removePulsingBorder(el: HTMLElement): void {
  el.classList.remove(PULSING_CLASS);
}

/** Place a floating element near the field; clamps to the viewport. */
function positionNear(node: HTMLElement, el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  // Measure after the node is in the document so multi-line panels can be
  // placed fully above the field instead of covering its first lines.
  const height = node.getBoundingClientRect().height || 24;
  node.style.position = 'fixed';
  // -260 leaves room for the copy panel's 240px min-width on narrow viewports.
  node.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 260))}px`;
  node.style.zIndex = '2147483647';

  const aboveTop = rect.top - height - 6;
  if (aboveTop >= 4) {
    node.style.top = `${aboveTop}px`;
  } else {
    node.style.top = `${Math.min(rect.bottom + 4, Math.max(4, window.innerHeight - height - 4))}px`;
  }
}

/**
 * Show a floating toast near the element.
 * Prefers above the field; falls back below if near top; clamps to viewport.
 */
export function showToast(
  el: HTMLElement,
  message: string,
  type: 'loading' | 'success' | 'error',
): void {
  removeToast();

  const toast = document.createElement('div');
  toast.className = TOAST_CLASS;
  toast.setAttribute('data-anyllm-role', 'inline-toast');
  toast.setAttribute('data-type', type);
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);
  positionNear(toast, el);
  activeToast = toast;
}

/** Remove the active toast (and any dismiss timer) */
export function removeToast(): void {
  if (toastTimer != null) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  if (activeToast) {
    activeToast.remove();
    activeToast = null;
  }
}

/** Auto-dismiss toast after ms */
export function scheduleToastDismiss(ms = 2000): void {
  if (toastTimer != null) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  toastTimer = globalThis.setTimeout(() => {
    toastTimer = null;
    if (activeToast) {
      activeToast.remove();
      activeToast = null;
    }
  }, ms);
}

/** Clear all feedback (pulse + toast + copy panel) for cancelled/aborted runs */
export function clearFeedback(el?: HTMLElement | null): void {
  if (el) removePulsingBorder(el);
  removeToast();
  removeCopyPanel();
}

/** Test helper access */
export function getActiveToast(): HTMLElement | null {
  return activeToast;
}

export interface CopyPanelOptions {
  /** Short line explaining why the translation was not written. */
  message?: string;
  /** Auto-dismiss delay (default 45s; pauses while hovered). */
  timeoutMs?: number;
}

/** Platform-aware paste shortcut shown in the panel hint. */
function pasteShortcut(): string {
  const platform = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘V' : 'Ctrl+V';
}

/**
 * Show a copyable translation near the field.
 *
 * Used when the write-back cannot touch the field (framework-owned composer,
 * verify failure). The primary action copies the translation and selects the
 * draft in the composer, so a real paste (Ctrl+V/⌘V) — the one write path
 * every editor honors — replaces the draft in one keystroke.
 */
export function showCopyPanel(
  el: HTMLElement,
  text: string,
  options: CopyPanelOptions = {},
): void {
  removeCopyPanel();

  const panel = document.createElement('div');
  panel.className = COPY_PANEL_CLASS;
  panel.setAttribute('data-anyllm-role', 'inline-copy-panel');
  // Marks extension-owned interactive UI so the editable guards skip it
  // (the panel holds a textarea the user may edit).
  panel.setAttribute('data-anyllm-ui', '');
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Translation');

  const header = document.createElement('div');
  header.className = 'anyllm-inline-copy-panel__header';

  const title = document.createElement('span');
  title.className = 'anyllm-inline-copy-panel__title';
  title.textContent = 'Translation';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'anyllm-inline-copy-panel__close';
  closeButton.setAttribute('aria-label', 'Dismiss');
  closeButton.textContent = '×';
  closeButton.addEventListener('mousedown', (event) => event.preventDefault());
  closeButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    removeCopyPanel();
  });
  header.append(title, closeButton);

  const message = document.createElement('div');
  message.className = 'anyllm-inline-copy-panel__message';
  message.textContent = options.message ?? "Can't edit this composer directly";

  // Editable so the user can fix the translation before pasting. The value is
  // also mirrored into textContent so `panel.textContent` keeps containing the
  // translation for tests/screen readers.
  const body = document.createElement('textarea');
  body.className = 'anyllm-inline-copy-panel__text';
  body.textContent = text;
  body.value = text;
  body.rows = Math.min(8, Math.max(2, text.split('\n').length));
  body.setAttribute('spellcheck', 'false');
  body.setAttribute('aria-label', 'Translated text — edit before copying');

  const hint = document.createElement('div');
  hint.className = 'anyllm-inline-copy-panel__hint';
  hint.textContent = `Then paste with ${pasteShortcut()} to replace your draft`;

  const actions = document.createElement('div');
  actions.className = 'anyllm-inline-copy-panel__actions';

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'anyllm-inline-copy-panel__copy';
  copyButton.textContent = 'Copy & select draft';
  copyButton.addEventListener('mousedown', (event) => event.preventDefault());
  copyButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void copyTextToClipboard(body.value).then((ok) => {
      if (!copyButton.isConnected) return;
      if (!ok) {
        copyButton.textContent = 'Copy failed';
        return;
      }
      const selected = focusAndSelectContents(el);
      copyButton.textContent = 'Copied ✓';
      hint.textContent = selected
        ? `Press ${pasteShortcut()} to replace your draft`
        : 'Paste it into the composer';
      globalThis.setTimeout(() => {
        if (copyButton.isConnected) copyButton.textContent = 'Copy & select draft';
      }, 2000);
    });
  });
  actions.append(copyButton);

  panel.append(header, message, body, actions, hint);

  // Dismiss when the composer's content changes — the paste landing, or fresh
  // typing making the panel obsolete. ('input' is the reliable signal: a
  // 'paste' event can fire yet be ignored by the editor.)
  const onFieldEdit = (event: Event) => {
    const target = event.target;
    if (target instanceof Node && (target === el || el.contains(target))) {
      removeCopyPanel();
    }
  };
  el.addEventListener('input', onFieldEdit, true);

  const onEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') removeCopyPanel();
  };
  document.addEventListener('keydown', onEscape, true);
  copyPanelCleanup = () => {
    el.removeEventListener('input', onFieldEdit, true);
    document.removeEventListener('keydown', onEscape, true);
  };

  document.body.appendChild(panel);
  positionNear(panel, el);
  activeCopyPanel = panel;

  const armTimer = (ms: number) => {
    if (copyPanelTimer != null) clearTimeout(copyPanelTimer);
    copyPanelTimer = globalThis.setTimeout(() => {
      copyPanelTimer = null;
      removeCopyPanel();
    }, ms);
  };
  armTimer(options.timeoutMs ?? 45_000);
  // Hovering means the user is reading/copying — never pull it away mid-read;
  // leaving gives a short grace period before it tidies itself up.
  panel.addEventListener('mouseenter', () => {
    if (copyPanelTimer != null) {
      clearTimeout(copyPanelTimer);
      copyPanelTimer = null;
    }
  });
  panel.addEventListener('mouseleave', () => {
    if (copyPanelTimer == null) armTimer(15_000);
  });
}

/** Remove the active copy panel (and any dismiss timer/listeners) */
export function removeCopyPanel(): void {
  if (copyPanelTimer != null) {
    clearTimeout(copyPanelTimer);
    copyPanelTimer = null;
  }
  if (copyPanelCleanup) {
    copyPanelCleanup();
    copyPanelCleanup = null;
  }
  if (activeCopyPanel) {
    activeCopyPanel.remove();
    activeCopyPanel = null;
  }
}

/** Test helper access */
export function getActiveCopyPanel(): HTMLElement | null {
  return activeCopyPanel;
}

/** Copy text via the async clipboard API, falling back to execCommand. */
async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied / insecure context — fall back below.
  }
  try {
    if (typeof document.execCommand !== 'function') return false;
    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.setAttribute('data-anyllm-role', 'inline-copy-scratch');
    scratch.setAttribute('data-anyllm-ui', '');
    scratch.style.position = 'fixed';
    scratch.style.opacity = '0';
    scratch.style.pointerEvents = 'none';
    document.body.appendChild(scratch);
    scratch.select();
    const ok = document.execCommand('copy');
    scratch.remove();
    return ok;
  } catch {
    return false;
  }
}

export { activeToast };
