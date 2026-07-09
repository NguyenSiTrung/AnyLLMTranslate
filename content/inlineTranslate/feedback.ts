/**
 * Visual feedback for inline translation (pulse border + toast).
 */

export const PULSING_CLASS = 'anyllm-inline-translating';
export const TOAST_CLASS = 'anyllm-inline-toast';

let activeToast: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

/** Add pulsing border to element */
export function addPulsingBorder(el: HTMLElement): void {
  el.classList.add(PULSING_CLASS);
}

/** Remove pulsing border from element */
export function removePulsingBorder(el: HTMLElement): void {
  el.classList.remove(PULSING_CLASS);
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

  const rect = el.getBoundingClientRect();
  toast.style.position = 'fixed';
  toast.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 160))}px`;
  toast.style.zIndex = '2147483647';

  // Prefer above; if near top of viewport, place below
  if (rect.top < 40) {
    toast.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 36)}px`;
  } else {
    toast.style.top = `${rect.top - 36}px`;
  }

  document.body.appendChild(toast);
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

/** Clear all feedback (pulse + toast) for cancelled/aborted runs */
export function clearFeedback(el?: HTMLElement | null): void {
  if (el) removePulsingBorder(el);
  removeToast();
}

/** Test helper access */
export function getActiveToast(): HTMLElement | null {
  return activeToast;
}

export { activeToast };
