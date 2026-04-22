/**
 * Subtitle Toast — Simple notification overlay for subtitle translation status.
 */

let toastContainer: HTMLElement | null = null;
let toastTimeout: ReturnType<typeof setTimeout> | null = null;

export function showSubtitleToast(message: string, isSticky = false) {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'anyllm-translate-subtitle-toast';
    document.body.appendChild(toastContainer);
  }

  // Clear previous children
  while (toastContainer.firstChild) {
    toastContainer.removeChild(toastContainer.firstChild);
  }

  // Inject standard loading spinner from inject.css if "Translating" is in message
  const isTranslating = message.toLowerCase().includes('translating');
  if (isTranslating) {
    const spinner = document.createElement('div');
    spinner.className = 'anyllm-translate-loading';
    spinner.style.marginRight = '8px';
    spinner.style.borderColor = 'white';
    spinner.style.borderBottomColor = 'transparent';
    toastContainer.appendChild(spinner);
  }

  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  toastContainer.appendChild(msgSpan);

  const closeButton = document.createElement('button');
  closeButton.className = 'anyllm-translate-toast-close';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.textContent = '✕';
  closeButton.addEventListener('click', hideSubtitleToast);
  toastContainer.appendChild(closeButton);

  toastContainer.classList.add('anyllm-translate-subtitle-toast-visible');

  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }

  if (!isSticky) {
    toastTimeout = setTimeout(() => {
      hideSubtitleToast();
    }, 3000);
  }
}

export function hideSubtitleToast() {
  if (toastContainer) {
    toastContainer.classList.remove('anyllm-translate-subtitle-toast-visible');
    // Remove from DOM after transition
    setTimeout(() => {
      if (toastContainer && !toastContainer.classList.contains('anyllm-translate-subtitle-toast-visible')) {
        toastContainer.remove();
        toastContainer = null;
      }
    }, 300);
  }
}
