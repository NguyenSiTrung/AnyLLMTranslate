/**
 * Visual feedback for inline translation (pulse border + toast + copy panel).
 */

export const PULSING_CLASS = 'anyllm-inline-translating';
export const TOAST_CLASS = 'anyllm-inline-toast';
export const COPY_PANEL_CLASS = 'anyllm-inline-copy-panel';

let activeToast: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let activeCopyPanel: HTMLElement | null = null;
let copyPanelTimer: ReturnType<typeof setTimeout> | null = null;

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
  node.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 160))}px`;
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
  /** Short line above the translation explaining why it was not written. */
  message?: string;
  /** Auto-dismiss delay (default 30s — long enough to read and copy). */
  timeoutMs?: number;
}

/**
 * Show a copyable translation near the field.
 *
 * Used when the write-back cannot touch the field (framework-owned composer,
 * verify failure) — the draft must stay exactly as the user typed it, so the
 * translation is handed over instead of forced in.
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
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Translation');

  const message = document.createElement('div');
  message.className = 'anyllm-inline-copy-panel__message';
  message.textContent = options.message ?? 'Copy the translation';

  const body = document.createElement('div');
  body.className = 'anyllm-inline-copy-panel__text';
  body.textContent = text;

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'anyllm-inline-copy-panel__copy';
  copyButton.textContent = 'Copy';
  copyButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void copyTextToClipboard(text).then((ok) => {
      copyButton.textContent = ok ? 'Copied ✓' : 'Copy failed';
      globalThis.setTimeout(() => {
        if (copyButton.isConnected) copyButton.textContent = 'Copy';
      }, 1500);
    });
  });

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'anyllm-inline-copy-panel__close';
  closeButton.setAttribute('aria-label', 'Dismiss');
  closeButton.textContent = '×';
  closeButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    removeCopyPanel();
  });

  panel.append(message, body, copyButton, closeButton);
  document.body.appendChild(panel);
  positionNear(panel, el);
  activeCopyPanel = panel;

  const timeout = options.timeoutMs ?? 30_000;
  copyPanelTimer = globalThis.setTimeout(() => {
    copyPanelTimer = null;
    removeCopyPanel();
  }, timeout);
}

/** Remove the active copy panel (and any dismiss timer) */
export function removeCopyPanel(): void {
  if (copyPanelTimer != null) {
    clearTimeout(copyPanelTimer);
    copyPanelTimer = null;
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
