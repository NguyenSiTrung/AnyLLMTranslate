/**
 * Text Selection Translate — shows a floating translate button on text selection,
 * then displays translation in a tooltip near the selection.
 */

import { loadSettings } from '@/lib/config';

/** Minimum characters to trigger translate button */
const MIN_SELECTION_CHARS = 2;

/** Translate button template HTML */
const TRANSLATE_BUTTON_CLASS = 'lingua-selection-btn';
const TOOLTIP_CLASS = 'lingua-selection-tooltip';

/** State management */
let isEnabled = true;
let currentTooltip: HTMLElement | null = null;
let currentButton: HTMLElement | null = null;

/** Create the floating translate button */
function createTranslateButton(x: number, y: number): HTMLElement {
  removeTranslateButton();

  const btn = document.createElement('div');
  btn.className = TRANSLATE_BUTTON_CLASS;
  btn.setAttribute('data-lingua-role', 'selection-btn');
  btn.setAttribute('role', 'button');
  btn.setAttribute('aria-label', 'Translate selection');
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>`;

  // Position near selection (above the cursor)
  btn.style.left = `${x}px`;
  btn.style.top = `${y - 40}px`;

  document.body.appendChild(btn);
  currentButton = btn;

  return btn;
}

/** Remove the translate button */
function removeTranslateButton(): void {
  if (currentButton) {
    currentButton.remove();
    currentButton = null;
  }
}

/** Create the translation tooltip */
function createTooltip(
  text: string,
  x: number,
  y: number,
  isLoading = false,
): HTMLElement {
  removeTooltip();

  const tooltip = document.createElement('div');
  tooltip.className = TOOLTIP_CLASS;
  tooltip.setAttribute('data-lingua-role', 'selection-tooltip');
  tooltip.setAttribute('role', 'tooltip');

  if (isLoading) {
    tooltip.innerHTML = `
      <div class="lingua-tooltip-content">
        <div class="lingua-tooltip-loading">
          <div class="lingua-tooltip-spinner"></div>
          <span>Translating...</span>
        </div>
      </div>
    `;
  } else {
    tooltip.innerHTML = `
      <div class="lingua-tooltip-content">
        <div class="lingua-tooltip-text">${escapeHtml(text)}</div>
        <div class="lingua-tooltip-actions">
          <button class="lingua-tooltip-copy" aria-label="Copy translation" title="Copy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
          <button class="lingua-tooltip-close" aria-label="Close tooltip" title="Close">✕</button>
        </div>
      </div>
    `;

    // Wire up copy button
    const copyBtn = tooltip.querySelector('.lingua-tooltip-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        (copyBtn as HTMLElement).innerHTML = '✓';
        setTimeout(() => {
          (copyBtn as HTMLElement).innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
        }, 1500);
      });
    }

    // Wire up close button
    const closeBtn = tooltip.querySelector('.lingua-tooltip-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTooltip();
      });
    }
  }

  // Position near selection (above or below)
  const posY = y - 40 - 80 > 0 ? y - 40 - 80 : y + 20;

  tooltip.style.left = `${Math.max(10, Math.min(x - 100, window.innerWidth - 320))}px`;
  tooltip.style.top = `${posY + window.scrollY}px`;

  document.body.appendChild(tooltip);
  currentTooltip = tooltip;

  return tooltip;
}

/** Update tooltip content with translation */
function updateTooltipContent(translatedText: string): void {
  if (!currentTooltip) return;

  const contentDiv = currentTooltip.querySelector('.lingua-tooltip-content');
  if (!contentDiv) return;

  contentDiv.innerHTML = `
    <div class="lingua-tooltip-text">${escapeHtml(translatedText)}</div>
    <div class="lingua-tooltip-actions">
      <button class="lingua-tooltip-copy" aria-label="Copy translation" title="Copy">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      </button>
      <button class="lingua-tooltip-close" aria-label="Close tooltip" title="Close">✕</button>
    </div>
  `;

  // Re-wire buttons
  const copyBtn = contentDiv.querySelector('.lingua-tooltip-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(translatedText);
      (copyBtn as HTMLElement).innerHTML = '✓';
      setTimeout(() => {
        (copyBtn as HTMLElement).innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
      }, 1500);
    });
  }

  const closeBtn = contentDiv.querySelector('.lingua-tooltip-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeTooltip();
    });
  }
}

/** Remove the translation tooltip */
function removeTooltip(): void {
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
  }
}

/** Escape HTML to prevent XSS */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/** Handle mouseup event for text selection */
async function onMouseUp(event: MouseEvent): Promise<void> {
  if (!isEnabled) return;

  // Ignore clicks on our own UI elements
  const target = event.target as HTMLElement;
  if (!target || typeof target.closest !== 'function') return;
  if (
    target.closest(`.${TRANSLATE_BUTTON_CLASS}`) ||
    target.closest(`.${TOOLTIP_CLASS}`)
  ) {
    return;
  }

  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() ?? '';

  if (selectedText.length < MIN_SELECTION_CHARS) {
    removeTranslateButton();
    return;
  }

  // Get selection position
  const range = selection?.getRangeAt(0);
  if (!range) return;

  const rect = range.getBoundingClientRect();
  const x = rect.left + rect.width / 2 + window.scrollX;
  const y = rect.top + window.scrollY;

  // Show translate button
  const btn = createTranslateButton(x, y);

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();

    // Remove button and show loading tooltip
    removeTranslateButton();
    createTooltip('', x, y, true);

    try {
      const settings = await loadSettings();

      const response = await chrome.runtime.sendMessage({
        action: 'translateSelection',
        text: selectedText,
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
      });

      if (response?.success && response.translatedText) {
        updateTooltipContent(response.translatedText);
      } else {
        updateTooltipContent(`⚠ ${response?.error ?? 'Translation failed'}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Translation failed';
      updateTooltipContent(`⚠ ${errorMsg}`);
    }
  });
}

/** Handle keydown for Escape to dismiss tooltip */
function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    removeTooltip();
    removeTranslateButton();
  }
}

/** Handle click outside to dismiss tooltip */
function onClickOutside(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (!target || typeof target.closest !== 'function') return;
  if (
    !target.closest(`.${TOOLTIP_CLASS}`) &&
    !target.closest(`.${TRANSLATE_BUTTON_CLASS}`)
  ) {
    removeTooltip();
    removeTranslateButton();
  }
}

/** Initialize text selection translate feature */
export function initTextSelection(): () => void {
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('mousedown', onClickOutside);

  return () => {
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('mousedown', onClickOutside);
    removeTooltip();
    removeTranslateButton();
  };
}

/** Enable/disable text selection translate */
export function setTextSelectionEnabled(enabled: boolean): void {
  isEnabled = enabled;
  if (!enabled) {
    removeTooltip();
    removeTranslateButton();
  }
}

/** Get current enabled state */
export function isTextSelectionEnabled(): boolean {
  return isEnabled;
}

export { removeTooltip, removeTranslateButton, TRANSLATE_BUTTON_CLASS, TOOLTIP_CLASS };
