/**
 * Text Selection Translate — shows a floating translate button on text selection,
 * then displays translation (or dictionary popup) in a tooltip near the selection.
 */

import { loadSettings } from '@/lib/config';
import { isDictionaryModeCandidate } from '@/lib/selectionClassify';
import { extractSelectionContext } from '@/lib/selectionContext';
import {
  hasDictionaryFields,
  type SelectionDictionaryResult,
} from '@/lib/selectionDictionary';
import type { SelectionDictionaryPayload, TranslateSelectionResult } from '@/types/messages';

/** Minimum characters to trigger translate button */
const MIN_SELECTION_CHARS = 2;

/** Translate button template HTML */
const TRANSLATE_BUTTON_CLASS = 'anyllm-selection-btn';
const TOOLTIP_CLASS = 'anyllm-selection-tooltip';

/** State management */
let isEnabled = true;
let currentTooltip: HTMLElement | null = null;
let currentButton: HTMLElement | null = null;
let suppressNextMouseUp = false;
/** Monotonically increasing session id — bumped on every new selection
 *  translation so that stale LLM responses from a previous request
 *  are silently dropped instead of overwriting the current tooltip. */
let selectionSession = 0;

/**
 * Brand mark for the selection translate chip — same asset as the toolbar
 * icon (A monogram + bidirectional arrows). Requires `icon/*` in
 * web_accessible_resources so the page can paint the chrome-extension URL.
 */
function createBrandMarkImg(size = 32): HTMLImageElement {
  const img = document.createElement('img');
  img.src = chrome.runtime.getURL('icon/128.png');
  img.width = size;
  img.height = size;
  img.alt = '';
  img.draggable = false;
  img.setAttribute('aria-hidden', 'true');
  return img;
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
  btn.appendChild(createBrandMarkImg(32));

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

  // Position near the visible selection. x/y are document coordinates because
  // the tooltip is absolutely positioned in document space; viewport values are
  // only used to decide whether there is enough visible room above.
  const viewportX = x - window.scrollX;
  const viewportY = y - window.scrollY;
  const posX = Math.max(10, Math.min(viewportX - 100, window.innerWidth - 320)) + window.scrollX;
  const posY = (viewportY - 40 - 80 > 0 ? viewportY - 40 - 80 : viewportY + 20) + window.scrollY;

  tooltip.style.left = `${posX}px`;
  tooltip.style.top = `${posY}px`;

  document.body.appendChild(tooltip);
  currentTooltip = tooltip;

  return tooltip;
}

/** Map message payload to local dictionary type for field checks. */
function payloadToResult(
  payload: SelectionDictionaryPayload | undefined,
): SelectionDictionaryResult | null {
  if (!payload) return null;
  return {
    phonetic: payload.phonetic,
    definitions: payload.definitions,
    translation: payload.translation,
    contextualAnalysis: payload.contextualAnalysis,
  };
}

/**
 * Build dictionary layout DOM (pure DOM construction — testable).
 * Shows original word, phonetic, POS+meanings, examples, translation, context.
 */
export function buildDictionaryTooltipContent(
  originalText: string,
  dict: SelectionDictionaryPayload,
  translatedText: string,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'anyllm-word-dictionary';

  const head = document.createElement('div');
  head.className = 'anyllm-word-dictionary-head';

  const wordEl = document.createElement('div');
  wordEl.className = 'anyllm-word-dictionary-word';
  wordEl.textContent = originalText;
  head.appendChild(wordEl);

  if (dict.phonetic) {
    const phoneticEl = document.createElement('div');
    phoneticEl.className = 'anyllm-word-dictionary-phonetic';
    phoneticEl.textContent = dict.phonetic;
    head.appendChild(phoneticEl);
  }

  root.appendChild(head);

  if (dict.definitions && dict.definitions.length > 0) {
    const defsList = document.createElement('ul');
    defsList.className = 'anyllm-word-dictionary-defs';

    for (const def of dict.definitions) {
      if (!def.meaning && !def.pos) continue;
      const li = document.createElement('li');
      li.className = 'anyllm-word-dictionary-def';

      if (def.pos) {
        const pos = document.createElement('span');
        pos.className = 'anyllm-word-dictionary-pos';
        pos.textContent = def.pos;
        li.appendChild(pos);
      }

      if (def.meaning) {
        const meaning = document.createElement('span');
        meaning.className = 'anyllm-word-dictionary-meaning';
        meaning.textContent = def.meaning;
        li.appendChild(meaning);
      }

      if (def.example?.source || def.example?.target) {
        const ex = document.createElement('div');
        ex.className = 'anyllm-word-dictionary-example';
        if (def.example.source) {
          const src = document.createElement('div');
          src.className = 'anyllm-word-dictionary-example-source';
          src.textContent = def.example.source;
          ex.appendChild(src);
        }
        if (def.example.target) {
          const tgt = document.createElement('div');
          tgt.className = 'anyllm-word-dictionary-example-target';
          tgt.textContent = def.example.target;
          ex.appendChild(tgt);
        }
        li.appendChild(ex);
      }

      defsList.appendChild(li);
    }

    if (defsList.childNodes.length > 0) {
      root.appendChild(defsList);
    }
  }

  const primaryTranslation = dict.translation || translatedText;
  if (primaryTranslation) {
    const trans = document.createElement('div');
    trans.className = 'anyllm-word-dictionary-translation';
    trans.textContent = primaryTranslation;
    root.appendChild(trans);
  }

  if (dict.contextualAnalysis) {
    const analysis = document.createElement('div');
    analysis.className = 'anyllm-word-dictionary-context';
    analysis.textContent = dict.contextualAnalysis;
    root.appendChild(analysis);
  }

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'anyllm-tooltip-actions';
  actionsDiv.appendChild(buildCopyButton(primaryTranslation || originalText));
  actionsDiv.appendChild(buildCloseButton());
  root.appendChild(actionsDiv);

  return root;
}

/** Update tooltip with plain translation (sentence layout). */
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

/** Update tooltip with dictionary or sentence layout based on response. */
export function applySelectionResponse(
  originalText: string,
  response: TranslateSelectionResult,
): void {
  if (!currentTooltip) return;

  if (!response.success) {
    updateTooltipContent(`⚠ ${response.error ?? 'Translation failed'}`);
    return;
  }

  const dictResult = payloadToResult(response.dictionary);
  if (
    response.mode === 'dictionary' &&
    response.dictionary &&
    hasDictionaryFields(dictResult)
  ) {
    const contentDiv = currentTooltip.querySelector('.anyllm-tooltip-content');
    if (!contentDiv) return;
    while (contentDiv.firstChild) {
      contentDiv.removeChild(contentDiv.firstChild);
    }
    contentDiv.appendChild(
      buildDictionaryTooltipContent(
        originalText,
        response.dictionary,
        response.translatedText ?? '',
      ),
    );
    return;
  }

  updateTooltipContent(response.translatedText ?? '');
}

/** Remove the translation tooltip */
function removeTooltip(): void {
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
  }
}

/** Shared translate request + tooltip fill for button click and context menu. */
async function runSelectionTranslation(
  selectedText: string,
  x: number,
  y: number,
  range: Range | null,
): Promise<void> {
  selectionSession++;
  const requestSession = selectionSession;
  createTooltip('', x, y, true);

  try {
    const settings = await loadSettings();
    const dictionaryCandidate =
      settings.selectionDictionaryEnabled !== false &&
      isDictionaryModeCandidate(selectedText);

    const contextText = dictionaryCandidate
      ? extractSelectionContext({ selectedText, range })
      : '';

    const response = (await chrome.runtime.sendMessage({
      action: 'translateSelection',
      text: selectedText,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      ...(dictionaryCandidate
        ? { dictionaryMode: true, contextText: contextText || undefined }
        : {}),
    })) as TranslateSelectionResult | undefined;

    // Stale guard: a newer selection translation was started while
    // this one was in-flight — drop the response silently.
    if (requestSession !== selectionSession) return;

    if (response) {
      applySelectionResponse(selectedText, response);
    } else {
      updateTooltipContent('⚠ Translation failed');
    }
  } catch (error) {
    if (requestSession !== selectionSession) return;
    const errorMsg = error instanceof Error ? error.message : 'Translation failed';
    updateTooltipContent(`⚠ ${errorMsg}`);
  }
}

/** Handle mouseup event for text selection */
async function onMouseUp(event: MouseEvent): Promise<void> {
  if (!isEnabled) return;
  if (suppressNextMouseUp) {
    suppressNextMouseUp = false;
    return;
  }

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
  let hasStartedTranslation = false;

  const startTranslation = async (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (hasStartedTranslation) return;
    hasStartedTranslation = true;
    suppressNextMouseUp = true;

    // Remove button and show loading tooltip
    removeTranslateButton();
    // Clone range before selection may clear
    let rangeClone: Range | null = range;
    try {
      rangeClone = range.cloneRange();
    } catch {
      // keep original range reference if clone fails
    }
    await runSelectionTranslation(selectedText, x, y, rangeClone);
  };

  btn.addEventListener('mousedown', startTranslation);
  btn.addEventListener('click', startTranslation);
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
    suppressNextMouseUp = false;
    removeTooltip();
    removeTranslateButton();
  };
}

/** Enable/disable text selection translate */
export function setTextSelectionEnabled(enabled: boolean): void {
  isEnabled = enabled;
  if (!enabled) {
    suppressNextMouseUp = false;
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
  let range: Range | null = null;

  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    try {
      range = selection.getRangeAt(0).cloneRange();
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        x = rect.left + rect.width / 2 + window.scrollX;
        y = rect.top + window.scrollY;
      }
    } catch {
      range = null;
    }
  }

  // Remove any existing button/tooltip and show loading
  removeTranslateButton();
  await runSelectionTranslation(text, x, y, range);
}

export {
  removeTooltip,
  removeTranslateButton,
  TRANSLATE_BUTTON_CLASS,
  TOOLTIP_CLASS,
  updateTooltipContent,
};

/** Test-only: set module currentTooltip for applySelectionResponse unit tests. */
export function __setCurrentTooltipForTest(el: HTMLElement | null): void {
  currentTooltip = el;
}
