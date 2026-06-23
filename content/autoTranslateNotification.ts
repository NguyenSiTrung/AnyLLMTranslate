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
