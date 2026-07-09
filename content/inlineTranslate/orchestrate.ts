/**
 * Race-safe orchestration: snapshot → translate → verify → write-back.
 */

import { loadSettings } from '@/lib/config';
import { parseLanguagePrefix } from '@/lib/inlineTranslatePrefix';
import {
  getDeepActiveElement,
  getElementText,
  isEditableElement,
  isCodeEditor,
  isPasswordField,
  isStillWritable,
} from './editable';
import {
  addPulsingBorder,
  clearFeedback,
  removePulsingBorder,
  scheduleToastDismiss,
  showToast,
} from './feedback';
import { joinDualMode, writeElementText } from './writeback';
import type { InlineTranslateRuntimeConfig } from './types';

export interface OrchestrateOptions {
  /** Skip stripping trailing trigger characters (e.g. Alt+I path) */
  skipStripTrailing?: boolean;
  /** Explicit element; default deep active */
  element?: HTMLElement | null;
}

/** Fallback undo: element → original text before last successful/attempted translation */
export const undoMap = new WeakMap<Element, string>();

let isTranslating = false;
/** True while our own write-back dispatches synthetic input/change events */
let isWritingBack = false;
let requestSeq = 0;
/** Active request id for cancel-on-type */
let activeRequestId = 0;
/** Snapshot text at request start for cancel detection */
let activeSnapshotText: string | null = null;
let activeElement: HTMLElement | null = null;

export function isInlineTranslating(): boolean {
  return isTranslating;
}

export function isInlineWritingBack(): boolean {
  return isWritingBack;
}

/** Cancel in-flight request (user typed / focus left) */
export function cancelActiveRequest(reason = 'cancelled'): void {
  if (!isTranslating) return;
  // Never cancel because of our own synthetic write-back events
  if (isWritingBack) return;
  console.debug('[AnyLLMTranslate:inline] cancel', reason, activeRequestId);
  activeRequestId = 0;
  isTranslating = false;
  if (activeElement) {
    clearFeedback(activeElement);
  } else {
    clearFeedback();
  }
  activeSnapshotText = null;
  activeElement = null;
}

function writeSafe(el: HTMLElement, text: string): ReturnType<typeof writeElementText> {
  isWritingBack = true;
  try {
    return writeElementText(el, text);
  } finally {
    isWritingBack = false;
  }
}

function stripTrailingTrigger(text: string, key: string, count: number): string {
  let result = text;
  for (let i = 0; i < count; i++) {
    if (result.endsWith(key)) {
      result = result.slice(0, -key.length);
    }
  }
  return result;
}

/**
 * Attempt fallback undo: restore undoMap original if present.
 * Returns true if restored.
 */
export function tryFallbackUndo(el: HTMLElement): boolean {
  const original = undoMap.get(el);
  if (original == null) return false;
  const result = writeElementText(el, original);
  if (result.success) {
    undoMap.delete(el);
    showToast(el, 'Restored original', 'success');
    scheduleToastDismiss(2000);
    return true;
  }
  return false;
}

/**
 * Run the full translate pipeline on the focused (or provided) editable.
 */
export async function runInlineTranslate(
  config: InlineTranslateRuntimeConfig,
  options: OrchestrateOptions = {},
): Promise<void> {
  if (isTranslating) return;

  let targetEl = options.element ?? null;
  if (!targetEl) {
    const deep = getDeepActiveElement(document, true);
    if (deep instanceof HTMLElement && isEditableElement(deep)) {
      targetEl = deep;
    }
  }

  if (!targetEl || !isEditableElement(targetEl)) {
    console.debug('[AnyLLMTranslate:inline] no editable target');
    return;
  }

  if (isPasswordField(targetEl) || isCodeEditor(targetEl)) {
    console.debug('[AnyLLMTranslate:inline] blocked field type');
    return;
  }

  // Re-acquire if detached (SPA re-render)
  if (!targetEl.isConnected) {
    const active = getDeepActiveElement(document, true);
    if (active instanceof HTMLElement && isEditableElement(active)) {
      targetEl = active;
    } else {
      console.debug('[AnyLLMTranslate:inline] gesture ignored - target detached');
      return;
    }
  }

  let rawText = getElementText(targetEl);
  if (!options.skipStripTrailing) {
    rawText = stripTrailingTrigger(rawText, config.triggerKey, config.tapCount);
  }

  // Snapshot identity + text before any mutation
  const snapshotEl = targetEl;
  const snapshotRaw = rawText;

  // Language prefix
  const prefixResult = parseLanguagePrefix(rawText.trimStart(), {
    enabled: config.enableLanguagePrefix,
    prefixChar: config.languagePrefix,
  });
  const text = prefixResult.body.trim();
  const targetLanguageOverride = prefixResult.targetLang;

  if (!text) {
    console.debug('[AnyLLMTranslate:inline] gesture ignored - empty text');
    showToast(targetEl, '⚠ Type something first', 'error');
    scheduleToastDismiss(2000);
    return;
  }

  // Fallback undo: re-trigger on already-translated field restores original
  if (
    config.enableFallbackUndo &&
    undoMap.has(targetEl) &&
    targetEl.getAttribute('data-anyllm-inline-translated') === '1'
  ) {
    const restored = tryFallbackUndo(targetEl);
    if (restored) {
      targetEl.removeAttribute('data-anyllm-inline-translated');
      return;
    }
  }

  console.debug('[AnyLLMTranslate:inline] starting translation', {
    text,
    length: text.length,
    targetLanguageOverride,
  });

  const originalText = getElementText(targetEl);
  undoMap.set(targetEl, originalText);

  // Strip trailing triggers / prefix from field immediately
  const preTranslateDisplay = options.skipStripTrailing
    ? prefixResult.body.trim() || text
    : text;
  // Show body (without prefix) before request
  writeSafe(targetEl, preTranslateDisplay);

  const reqId = ++requestSeq;
  activeRequestId = reqId;
  activeSnapshotText = getElementText(targetEl);
  activeElement = targetEl;
  isTranslating = true;
  addPulsingBorder(targetEl);
  showToast(targetEl, 'Translating...', 'loading');

  try {
    const settings = await loadSettings();
    const targetLanguage =
      targetLanguageOverride ??
      config.targetLanguage ??
      settings.inlineTranslate?.targetLanguage ??
      settings.targetLanguage;

    // Cancel if user edited during await of loadSettings
    if (activeRequestId !== reqId) return;
    if (!isStillWritable(snapshotEl)) {
      cancelActiveRequest('disconnected');
      return;
    }
    if (getElementText(snapshotEl) !== activeSnapshotText) {
      cancelActiveRequest('user-edited');
      return;
    }

    console.debug('[AnyLLMTranslate:inline] sending translation request', {
      text,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage,
    });

    const response = await chrome.runtime.sendMessage({
      action: 'translateSelection',
      text,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage,
    });

    // Abort if cancelled or identity/text changed
    if (activeRequestId !== reqId) {
      console.debug('[AnyLLMTranslate:inline] response ignored - cancelled', reqId);
      return;
    }
    if (!isStillWritable(snapshotEl) || snapshotEl !== activeElement) {
      cancelActiveRequest('element-changed');
      return;
    }
    // User may have typed during network — abort write
    if (getElementText(snapshotEl) !== activeSnapshotText) {
      cancelActiveRequest('user-edited-after-response');
      return;
    }

    console.debug('[AnyLLMTranslate:inline] received response', response);

    if (response?.success && response.translatedText) {
      let out: string = response.translatedText;
      if (config.dualMode) {
        out = joinDualMode(text, response.translatedText, snapshotEl);
      }
      const write = writeSafe(snapshotEl, out);
      if (!write.success) {
        writeSafe(snapshotEl, originalText);
        showToast(snapshotEl, '⚠ Write failed', 'error');
        console.warn('[AnyLLMTranslate:inline] write-back failed');
      } else {
        snapshotEl.setAttribute('data-anyllm-inline-translated', '1');
        showToast(snapshotEl, 'Translated ✓', 'success');
      }
    } else {
      writeSafe(snapshotEl, originalText);
      showToast(snapshotEl, '⚠ Translation failed', 'error');
      console.warn('[AnyLLMTranslate:inline] translation failed', response);
    }
  } catch (error) {
    if (activeRequestId === reqId && snapshotEl.isConnected) {
      writeSafe(snapshotEl, originalText);
      showToast(snapshotEl, '⚠ Translation failed', 'error');
    }
    console.error('[AnyLLMTranslate:inline] translation error', error);
  } finally {
    if (activeRequestId === reqId) {
      isTranslating = false;
      activeRequestId = 0;
      activeSnapshotText = null;
      activeElement = null;
      removePulsingBorder(snapshotEl);
      scheduleToastDismiss(2000);
    }
  }

  void snapshotRaw;
}

/**
 * Notify that the user typed in the active field — cancel if translating.
 */
export function onUserInputDuringTranslate(el: Element | null): void {
  if (!isTranslating || !activeElement || isWritingBack) return;
  if (el === activeElement || (el && activeElement.contains(el))) {
    cancelActiveRequest('user-input');
  }
}
