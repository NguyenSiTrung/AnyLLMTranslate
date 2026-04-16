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

  // Inject standard loading spinner from inject.css if "Translating" is in message
  const isTranslating = message.toLowerCase().includes('translating');
  
  toastContainer.innerHTML = `
    ${isTranslating ? '<div class="anyllm-translate-loading" style="margin-right: 8px; border-color: white; border-bottom-color: transparent;"></div>' : ''}
    <span>${message}</span>
    <button class="anyllm-translate-toast-close" aria-label="Close">✕</button>
  `;

  // Wire up close button
  const closeButton = toastContainer.querySelector('.anyllm-translate-toast-close');
  if (closeButton) {
    closeButton.addEventListener('click', hideSubtitleToast);
  }
  
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
