/**
 * Text Selection Translate — shows a floating translate button on text selection,
 * then displays translation in a tooltip near the selection.
 */

import { loadSettings } from '@/lib/config';

/** Minimum characters to trigger translate button */
const MIN_SELECTION_CHARS = 2;

/** Translate button template HTML */
const TRANSLATE_BUTTON_CLASS = 'anyllm-selection-btn';
const TOOLTIP_CLASS = 'anyllm-selection-tooltip';

/** State management */
let isEnabled = true;
let currentTooltip: HTMLElement | null = null;
let currentButton: HTMLElement | null = null;

/** Build an SVG icon using createElementNS */
function createSvgIcon(width: number, height: number, paths: string[]): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

/** Build copy SVG icon */
function createCopySvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '9');
  rect.setAttribute('y', '9');
  rect.setAttribute('width', '13');
  rect.setAttribute('height', '13');
  rect.setAttribute('rx', '2');
  rect.setAttribute('ry', '2');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1');

  svg.appendChild(rect);
  svg.appendChild(path);
  return svg;
}

/** Build a copy button with SVG icon and click handler */
function buildCopyButton(textToCopy: string): HTMLButtonElement {
  const copyBtn = document.createElement('button');
  copyBtn.className = 'anyllm-tooltip-copy';
  copyBtn.setAttribute('aria-label', 'Copy translation');
  copyBtn.setAttribute('title', 'Copy');
  copyBtn.appendChild(createCopySvg());

  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(textToCopy);
      copyBtn.textContent = '✓';
      setTimeout(() => {
        copyBtn.textContent = '';
        copyBtn.appendChild(createCopySvg());
      }, 1500);
    } catch {
      copyBtn.textContent = '!';
      setTimeout(() => {
        copyBtn.textContent = '';
        copyBtn.appendChild(createCopySvg());
      }, 1500);
    }
  });

  return copyBtn;
}

/** Build a close button with click handler */
function buildCloseButton(): HTMLButtonElement {
  const closeBtn = document.createElement('button');
  closeBtn.className = 'anyllm-tooltip-close';
  closeBtn.setAttribute('aria-label', 'Close tooltip');
  closeBtn.setAttribute('title', 'Close');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeTooltip();
  });
  return closeBtn;
}

/** Create the floating translate button */
function createTranslateButton(x: number, y: number): HTMLElement {
  removeTranslateButton();

  const btn = document.createElement('div');
  btn.className = TRANSLATE_BUTTON_CLASS;
  btn.setAttribute('data-anyllm-role', 'selection-btn');
  btn.setAttribute('role', 'button');
  btn.setAttribute('aria-label', 'Translate selection');
  btn.appendChild(
    createSvgIcon(16, 16, [
      'M5 8l6 6',
      'M4 14l6-6 2-3',
      'M2 5h12',
      'M7 2h1',
      'M22 22l-5-10-5 10',
      'M14 18h6',
    ]),
  );

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
  tooltip.setAttribute('data-anyllm-role', 'selection-tooltip');
  tooltip.setAttribute('role', 'tooltip');

  const contentDiv = document.createElement('div');
  contentDiv.className = 'anyllm-tooltip-content';

  if (isLoading) {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'anyllm-tooltip-loading';

    const spinner = document.createElement('div');
    spinner.className = 'anyllm-tooltip-spinner';

    const span = document.createElement('span');
    span.textContent = 'Translating...';

    loadingDiv.appendChild(spinner);
    loadingDiv.appendChild(span);
    contentDiv.appendChild(loadingDiv);
  } else {
    const textDiv = document.createElement('div');
    textDiv.className = 'anyllm-tooltip-text';
    textDiv.textContent = text;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'anyllm-tooltip-actions';
    actionsDiv.appendChild(buildCopyButton(text));
    actionsDiv.appendChild(buildCloseButton());

    contentDiv.appendChild(textDiv);
    contentDiv.appendChild(actionsDiv);
  }

  tooltip.appendChild(contentDiv);

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

  const contentDiv = currentTooltip.querySelector('.anyllm-tooltip-content');
  if (!contentDiv) return;

  while (contentDiv.firstChild) {
    contentDiv.removeChild(contentDiv.firstChild);
  }

  const textDiv = document.createElement('div');
  textDiv.className = 'anyllm-tooltip-text';
  textDiv.textContent = translatedText;

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'anyllm-tooltip-actions';
  actionsDiv.appendChild(buildCopyButton(translatedText));
  actionsDiv.appendChild(buildCloseButton());

  contentDiv.appendChild(textDiv);
  contentDiv.appendChild(actionsDiv);
}

/** Remove the translation tooltip */
function removeTooltip(): void {
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
  }
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

/**
 * Handle "Translate Selection" from context menu.
 * Uses the current window selection position for tooltip placement,
 * shows a loading tooltip, then translates via the background service.
 */
export async function translateSelectedTextViaContextMenu(text: string): Promise<void> {
  // Try to position near the current selection, fall back to viewport center
  let x = window.innerWidth / 2 + window.scrollX;
  let y = window.innerHeight / 3 + window.scrollY;

  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      x = rect.left + rect.width / 2 + window.scrollX;
      y = rect.top + window.scrollY;
    }
  }

  // Remove any existing button/tooltip and show loading
  removeTranslateButton();
  createTooltip('', x, y, true);

  try {
    const settings = await loadSettings();

    const response = await chrome.runtime.sendMessage({
      action: 'translateSelection',
      text,
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
}

export { removeTooltip, removeTranslateButton, TRANSLATE_BUTTON_CLASS, TOOLTIP_CLASS };
