/**
 * Auto-translate notification bar — shown when a page is auto-translated.
 */

const NOTIFICATION_ATTR = 'data-anyllm-role';
const NOTIFICATION_ROLE = 'auto-translate-notification';
const HIDING_CLASS = 'anyllm-notification-hiding';
const AUTO_DISMISS_MS = 5000;
const FADE_DURATION_MS = 300;

let notificationEl: HTMLElement | null = null;
let autoDismissTimeout: ReturnType<typeof setTimeout> | null = null;
// P1: track the fade-out timeout so it can be cancelled. Previously it was
// untracked — if a new notification was shown (or removeNotification ran) during
// the 300ms fade window, the stale fade callback still fired and removed the
// fresh notification.
let fadeTimeout: ReturnType<typeof setTimeout> | null = null;

function clearAutoDismiss(): void {
  if (autoDismissTimeout) {
    clearTimeout(autoDismissTimeout);
    autoDismissTimeout = null;
  }
  if (fadeTimeout) {
    clearTimeout(fadeTimeout);
    fadeTimeout = null;
  }
}

function removeNotification(): void {
  clearAutoDismiss();
  if (notificationEl) {
    notificationEl.remove();
    notificationEl = null;
  }
}

export function showAutoTranslateNotification(onDisable: () => void): void {
  // Prevent duplicates
  if (notificationEl) {
    removeNotification();
  }

  const bar = document.createElement('div');
  bar.setAttribute(NOTIFICATION_ATTR, NOTIFICATION_ROLE);

  const label = document.createElement('span');
  label.textContent = '🌐 Auto-translating this page';
  bar.appendChild(label);

  const disableBtn = document.createElement('button');
  disableBtn.textContent = 'Disable for this site';
  disableBtn.addEventListener('click', () => {
    onDisable();
    removeNotification();
  });
  bar.appendChild(disableBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'anyllm-notification-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
    removeNotification();
  });
  bar.appendChild(closeBtn);

  document.body.appendChild(bar);
  notificationEl = bar;

  autoDismissTimeout = setTimeout(() => {
    if (notificationEl) {
      notificationEl.classList.add(HIDING_CLASS);
      fadeTimeout = setTimeout(() => {
        fadeTimeout = null;
        removeNotification();
      }, FADE_DURATION_MS);
    }
  }, AUTO_DISMISS_MS);
}

export function hideAutoTranslateNotification(): void {
  removeNotification();
}

const ERROR_NOTIFICATION_ROLE = 'translation-error-notification';
const ERROR_AUTO_DISMISS_MS = 8000;
/** Ignore re-shows of the same message while scrolling through many failed batches. */
const ERROR_THROTTLE_MS = 15_000;

let errorNotificationEl: HTMLElement | null = null;
let errorDismissTimeout: ReturnType<typeof setTimeout> | null = null;
let errorFadeTimeout: ReturnType<typeof setTimeout> | null = null;
let lastErrorMessage = '';
let lastErrorShownAt = 0;

function removeErrorNotification(): void {
  if (errorDismissTimeout) {
    clearTimeout(errorDismissTimeout);
    errorDismissTimeout = null;
  }
  if (errorFadeTimeout) {
    clearTimeout(errorFadeTimeout);
    errorFadeTimeout = null;
  }
  if (errorNotificationEl) {
    errorNotificationEl.remove();
    errorNotificationEl = null;
  }
}

/**
 * One-shot page-level banner for systemic translation failures (pool exhausted,
 * all keys rate-limited, etc.). Per-piece UI stays compact; this surfaces the
 * full message once instead of under every paragraph.
 *
 * Throttled: scrolling through a long page with a dead pool must not flash a
 * new banner on every viewport batch.
 */
export function showTranslationErrorNotification(message: string): void {
  const now = Date.now();
  if (
    errorNotificationEl &&
    message === lastErrorMessage &&
    now - lastErrorShownAt < ERROR_THROTTLE_MS
  ) {
    return;
  }
  if (
    !errorNotificationEl &&
    message === lastErrorMessage &&
    now - lastErrorShownAt < ERROR_THROTTLE_MS
  ) {
    return;
  }

  removeErrorNotification();
  lastErrorMessage = message;
  lastErrorShownAt = now;

  const bar = document.createElement('div');
  bar.setAttribute(NOTIFICATION_ATTR, ERROR_NOTIFICATION_ROLE);
  bar.className = 'anyllm-translation-error-notification';

  const label = document.createElement('span');
  label.textContent = `⚠ ${message}`;
  bar.appendChild(label);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'anyllm-notification-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Dismiss');
  closeBtn.addEventListener('click', () => {
    removeErrorNotification();
  });
  bar.appendChild(closeBtn);

  document.body.appendChild(bar);
  errorNotificationEl = bar;

  errorDismissTimeout = setTimeout(() => {
    if (errorNotificationEl) {
      errorNotificationEl.classList.add(HIDING_CLASS);
      errorFadeTimeout = setTimeout(() => {
        errorFadeTimeout = null;
        removeErrorNotification();
      }, FADE_DURATION_MS);
    }
  }, ERROR_AUTO_DISMISS_MS);
}

export function hideTranslationErrorNotification(): void {
  removeErrorNotification();
  lastErrorMessage = '';
  lastErrorShownAt = 0;
}
