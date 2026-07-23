/**
 * Text Selection Translate — floating chip + branded result dialog.
 */

import { loadSettings } from '@/lib/config';
import { isDictionaryModeCandidate } from '@/lib/selectionClassify';
import { extractSelectionContext } from '@/lib/selectionContext';
import {
  hasDictionaryFields,
  type SelectionDictionaryResult,
} from '@/lib/selectionDictionary';
import type { SelectionDictionaryPayload, TranslateSelectionResult } from '@/types/messages';
import {
  addToGlobalGlossary,
  applyDictionary,
  applyError,
  applySentence,
  buildDictionaryContent,
  CHIP_CLASS,
  createTranslateChip,
  DIALOG_CLASS,
  DIALOG_LEGACY_CLASS,
  getDialogEl,
  getOriginalText,
  getPrimaryText,
  getTargetLanguage,
  isPinned,
  removeDialog,
  removeTranslateChip,
  reposition,
  setPinned,
  setSpeakingState,
  shouldDismissOnOutsideClick,
  showLoading,
  showStatus,
  SpeakController,
  __setDialogForTest,
} from '@/content/selectionBubble';
import type { AnchorRect, BubbleActionHandlers } from '@/content/selectionBubble';

/** Minimum characters to trigger translate button */
const MIN_SELECTION_CHARS = 2;

/** @deprecated Prefer DIALOG_CLASS; kept for tests/selectors (legacy class on root). */
const TOOLTIP_CLASS = DIALOG_LEGACY_CLASS;
const TRANSLATE_BUTTON_CLASS = CHIP_CLASS;

let isEnabled = true;
let suppressNextMouseUp = false;
/** Monotonically increasing session id — drop stale LLM responses. */
let selectionSession = 0;

const speakController = new SpeakController();
speakController.setOnSpeakingChange((speaking) => {
  setSpeakingState(speaking);
});

/** Last request context for retry */
let lastSelectedText = '';
let lastAnchor: AnchorRect | null = null;
let lastRange: Range | null = null;

function viewportAnchorFromRange(range: Range): AnchorRect {
  const rect = range.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height || 20,
  };
}

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
 * Build dictionary layout DOM (pure — testable).
 * Actions live in the dialog footer; this root has no action bar.
 */
export function buildDictionaryTooltipContent(
  originalText: string,
  dict: SelectionDictionaryPayload,
  translatedText: string,
): HTMLElement {
  return buildDictionaryContent(originalText, dict, translatedText);
}

/** Update tooltip with plain translation (sentence layout). */
function updateTooltipContent(translatedText: string): void {
  if (!getDialogEl()) return;
  applySentence({
    translatedText,
    originalText: getOriginalText() || lastSelectedText,
  });
}

/** Update dialog with dictionary or sentence layout based on response. */
export function applySelectionResponse(
  originalText: string,
  response: TranslateSelectionResult,
): void {
  if (!getDialogEl()) return;

  if (!response.success) {
    applyError(response.error ?? 'Translation failed');
    return;
  }

  const dictResult = payloadToResult(response.dictionary);
  if (
    response.mode === 'dictionary' &&
    response.dictionary &&
    hasDictionaryFields(dictResult)
  ) {
    applyDictionary({
      originalText,
      dict: response.dictionary,
      translatedText: response.translatedText ?? '',
    });
    return;
  }

  applySentence({
    translatedText: response.translatedText ?? '',
    originalText,
  });
}

function buildHandlers(): BubbleActionHandlers {
  return {
    onClose: () => {
      speakController.stop();
      setSpeakingState(false);
      removeDialog();
      removeTranslateChip();
    },
    onPin: () => {
      setPinned(!isPinned());
    },
    onCopy: async () => {
      const text = getPrimaryText();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        showStatus('Copied', 'success');
      } catch {
        showStatus('Copy failed', 'error');
      }
    },
    onRetry: async () => {
      if (!lastSelectedText || !lastAnchor) return;
      await runSelectionTranslation(lastSelectedText, lastAnchor, lastRange);
    },
    onSpeak: async () => {
      const text = getPrimaryText();
      if (!text) return;
      try {
        if (speakController.isSpeaking()) {
          speakController.stop();
          setSpeakingState(false);
          return;
        }
        const result = await speakController.speakSmart(text, getTargetLanguage());
        if ('fallbackFromProvider' in result && result.fallbackFromProvider) {
          showStatus('Using browser voice', 'info');
        }
      } catch (e) {
        setSpeakingState(false);
        showStatus(
          e instanceof Error ? e.message : 'Speech not supported',
          'error',
        );
      }
    },
    onGlossary: async () => {
      const source = getOriginalText() || lastSelectedText;
      const target = getPrimaryText();
      const result = await addToGlobalGlossary(source, target);
      if (result.status === 'added') {
        showStatus('Added to glossary', 'success');
      } else if (result.status === 'duplicate') {
        showStatus('Already in glossary', 'info');
      } else if (result.status === 'invalid') {
        showStatus(result.reason, 'error');
      } else {
        showStatus(result.reason, 'error');
      }
    },
  };
}

/** Shared translate request + dialog fill for button click and context menu. */
async function runSelectionTranslation(
  selectedText: string,
  anchor: AnchorRect,
  range: Range | null,
): Promise<void> {
  selectionSession++;
  const requestSession = selectionSession;
  lastSelectedText = selectedText;
  lastAnchor = anchor;
  lastRange = range;

  speakController.stop();
  setSpeakingState(false);

  const settings = await loadSettings();
  showLoading({
    anchor,
    originalText: selectedText,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    handlers: buildHandlers(),
  });

  try {
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

    if (requestSession !== selectionSession) return;

    if (response) {
      applySelectionResponse(selectedText, response);
    } else {
      applyError('Translation failed');
    }
    reposition();
  } catch (error) {
    if (requestSession !== selectionSession) return;
    const errorMsg = error instanceof Error ? error.message : 'Translation failed';
    applyError(errorMsg);
  }
}

/** Handle mouseup event for text selection */
async function onMouseUp(event: MouseEvent): Promise<void> {
  if (!isEnabled) return;
  if (suppressNextMouseUp) {
    suppressNextMouseUp = false;
    return;
  }

  const target = event.target as HTMLElement;
  if (!target || typeof target.closest !== 'function') return;
  if (
    target.closest(`.${TRANSLATE_BUTTON_CLASS}`) ||
    target.closest(`.${DIALOG_CLASS}`) ||
    target.closest(`.${TOOLTIP_CLASS}`)
  ) {
    return;
  }

  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() ?? '';

  if (selectedText.length < MIN_SELECTION_CHARS) {
    removeTranslateChip();
    return;
  }

  const range = selection?.getRangeAt(0);
  if (!range) return;

  const rect = range.getBoundingClientRect();
  const x = rect.left + rect.width / 2 + window.scrollX;
  const y = rect.top + window.scrollY;
  const anchor = viewportAnchorFromRange(range);

  const btn = createTranslateChip(x, y);
  let hasStartedTranslation = false;

  const startTranslation = async (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (hasStartedTranslation) return;
    hasStartedTranslation = true;
    suppressNextMouseUp = true;

    removeTranslateChip();
    let rangeClone: Range | null = range;
    try {
      rangeClone = range.cloneRange();
    } catch {
      // keep original
    }
    await runSelectionTranslation(selectedText, anchor, rangeClone);
  };

  btn.addEventListener('mousedown', startTranslation);
  btn.addEventListener('click', startTranslation);
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    speakController.stop();
    setSpeakingState(false);
    removeDialog();
    removeTranslateChip();
  }
}

function onClickOutside(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (!target || typeof target.closest !== 'function') return;
  if (
    target.closest(`.${TOOLTIP_CLASS}`) ||
    target.closest(`.${DIALOG_CLASS}`) ||
    target.closest(`.${TRANSLATE_BUTTON_CLASS}`)
  ) {
    return;
  }

  if (!shouldDismissOnOutsideClick()) {
    removeTranslateChip();
    return;
  }

  speakController.stop();
  setSpeakingState(false);
  removeDialog();
  removeTranslateChip();
}

function onViewportChange(): void {
  if (getDialogEl()) reposition();
}

/** Initialize text selection translate feature */
export function initTextSelection(): () => void {
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('mousedown', onClickOutside);
  window.addEventListener('resize', onViewportChange, { passive: true });
  window.addEventListener('scroll', onViewportChange, { passive: true, capture: true });

  return () => {
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('mousedown', onClickOutside);
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('scroll', onViewportChange, true);
    suppressNextMouseUp = false;
    speakController.stop();
    removeDialog();
    removeTranslateChip();
  };
}

export function setTextSelectionEnabled(enabled: boolean): void {
  isEnabled = enabled;
  if (!enabled) {
    suppressNextMouseUp = false;
    speakController.stop();
    removeDialog();
    removeTranslateChip();
  }
}

export function isTextSelectionEnabled(): boolean {
  return isEnabled;
}

/**
 * Handle "Translate Selection" from context menu.
 */
export async function translateSelectedTextViaContextMenu(text: string): Promise<void> {
  let anchor: AnchorRect = {
    left: window.innerWidth / 2,
    top: window.innerHeight / 3,
    width: 1,
    height: 1,
  };
  let range: Range | null = null;

  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    try {
      range = selection.getRangeAt(0).cloneRange();
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        anchor = viewportAnchorFromRange(range);
      }
    } catch {
      range = null;
    }
  }

  removeTranslateChip();
  await runSelectionTranslation(text, anchor, range);
}

export {
  removeDialog as removeTooltip,
  removeTranslateChip as removeTranslateButton,
  TRANSLATE_BUTTON_CLASS,
  TOOLTIP_CLASS,
  updateTooltipContent,
  DIALOG_CLASS,
};

/** Test-only: set module dialog for applySelectionResponse unit tests. */
export function __setCurrentTooltipForTest(el: HTMLElement | null): void {
  __setDialogForTest(el);
}
