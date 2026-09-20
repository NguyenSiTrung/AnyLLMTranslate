/**
 * Race-safe orchestration: snapshot → translate → verify → write-back.
 *
 * The draft is never mutated before the translation arrives: a failed request
 * or a refused write must leave exactly what the user typed.
 */

import { loadSettings } from '@/lib/config';
import { parseLanguagePrefix } from '@/lib/inlineTranslatePrefix';
import {
  getDeepActiveElement,
  getElementText,
  isEditableElement,
  isCodeEditor,
  isFocusedWithin,
  isFrameworkOwnedEditor,
  isPasswordField,
  isStillWritable,
} from './editable';
import {
  addPulsingBorder,
  clearFeedback,
  removePulsingBorder,
  removeToast,
  scheduleToastDismiss,
  showCopyPanel,
  showToast,
} from './feedback';
import {
  isSyntheticInlineEvent,
  joinDualMode,
  verifyWrite,
  writeElementText,
  writeElementTextAsync,
} from './writeback';
import type { WriteBackResult } from './writeback';
import type { InlineTranslateRuntimeConfig } from './types';

/** A stalled request must not leave the field stuck in "Translating…". */
export const INLINE_REQUEST_TIMEOUT_MS = 30_000;

/** Fallback undo only applies while the translation is still recent. */
export const UNDO_WINDOW_MS = 5 * 60 * 1000;

/** Async helper for CE framework sync (ChatGPT etc.) with fallback to sync */
async function writeSafeAsync(el: HTMLElement, text: string): Promise<WriteBackResult> {
  isWritingBack = true;
  try {
    // Prefer async path for contentEditable to allow editors to reconcile via events
    if (el.isContentEditable || el.contentEditable === 'true') {
      return await writeElementTextAsync(el, text);
    }
    return writeElementText(el, text);
  } finally {
    isWritingBack = false;
  }
}

/**
 * Await a background response with a timeout so a lost message cannot leave the
 * feature in a permanent "Translating…" state.
 */
function sendTranslateRequest(message: unknown, timeoutMs = INLINE_REQUEST_TIMEOUT_MS): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`inline translate request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    try {
      Promise.resolve(chrome.runtime.sendMessage(message)).then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

export interface OrchestrateOptions {
  /** Skip stripping trailing trigger characters (e.g. Alt+I path) */
  skipStripTrailing?: boolean;
  /** Explicit element; default deep active */
  element?: HTMLElement | null;
}

/** Original draft per element, captured before the first successful write. */
export interface UndoEntry {
  text: string;
  /** Original markup for contentEditable fields (null for input/textarea). */
  html: string | null;
}

/** Fallback undo: element → original draft before the last translation */
export const undoMap = new WeakMap<Element, UndoEntry>();

/**
 * Last successful write-back per element. Fallback undo only runs when the
 * field still holds this value *and* the write happened recently. If the user
 * typed/deleted, re-trigger translates the new content instead of restoring the
 * original.
 */
export const lastWrittenMap = new WeakMap<Element, { text: string; at: number }>();

/** Elements already watched for draft edits (listener attached once). */
const undoWatchAttached = new WeakSet<Element>();

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

/**
 * Any real edit to the field invalidates the fallback-undo state: the draft is
 * no longer the translation we wrote, so restoring the old original would
 * destroy what the user just typed.
 */
function attachUndoInvalidation(el: HTMLElement): void {
  if (undoWatchAttached.has(el)) return;
  undoWatchAttached.add(el);
  el.addEventListener(
    'input',
    (event) => {
      if (isSyntheticInlineEvent(event)) return;
      clearInlineTranslateState(el);
    },
    true,
  );
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
 * Attempt fallback undo: restore the original draft if present.
 *
 * contentEditable fields are restored from the captured markup so mentions,
 * links and emoji survive; input/textarea go through the normal write path.
 * Returns true if restored.
 */
export function tryFallbackUndo(el: HTMLElement): boolean {
  const entry = undoMap.get(el);
  if (!entry) return false;

  const isTextControl = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  let restored = false;
  if (entry.html != null && !isTextControl && !isFrameworkOwnedEditor(el)) {
    try {
      el.innerHTML = entry.html;
      restored = verifyWrite(el, entry.text);
    } catch {
      restored = false;
    }
  }
  if (!restored) {
    restored = writeElementText(el, entry.text).success;
  }
  if (!restored) return false;

  undoMap.delete(el);
  lastWrittenMap.delete(el);
  el.removeAttribute('data-anyllm-inline-translated');
  showToast(el, 'Restored original', 'success');
  scheduleToastDismiss(2000);
  return true;
}

/**
 * True only when the field still contains the last successful translation
 * (ignoring trailing trigger keys from the current gesture). If the user
 * edited after translate — or the write is old — returns false so we
 * re-translate instead of undo.
 */
export function shouldFallbackUndo(
  el: HTMLElement,
  currentTextAfterStrip: string,
): boolean {
  if (el.getAttribute('data-anyllm-inline-translated') !== '1') return false;
  if (!undoMap.has(el)) return false;
  const lastWritten = lastWrittenMap.get(el);
  if (lastWritten == null) return false;
  if (Date.now() - lastWritten.at >= UNDO_WINDOW_MS) return false;
  return currentTextAfterStrip === lastWritten.text;
}

/** Clear translate/undo bookkeeping so the next trigger always translates. */
export function clearInlineTranslateState(el: HTMLElement): void {
  undoMap.delete(el);
  lastWrittenMap.delete(el);
  el.removeAttribute('data-anyllm-inline-translated');
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

  // Snapshot identity before any mutation
  const snapshotEl = targetEl;

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

  // Fallback undo ONLY when the field is still exactly the last translation.
  // If the user deleted/typed new content, re-trigger translates that content.
  // Compare against full stripped raw (before prefix strip) and against body
  // so dual-mode / prefix edge cases still match when unedited.
  if (config.enableFallbackUndo) {
    const candidates = [rawText.trim(), text, getElementText(targetEl)];
    const unchanged = candidates.some((c) => shouldFallbackUndo(targetEl, c));
    if (unchanged) {
      const restored = tryFallbackUndo(targetEl);
      if (restored) return;
    }
    // Edited after last translate — drop stale undo so we translate fresh
    if (targetEl.getAttribute('data-anyllm-inline-translated') === '1') {
      clearInlineTranslateState(targetEl);
    }
  }

  console.debug('[AnyLLMTranslate:inline] starting translation', {
    text,
    length: text.length,
    targetLanguageOverride,
  });

  // Capture the draft exactly as typed — the field is not touched until the
  // translation arrives, so a failure cannot lose the user's draft.
  const originalText = getElementText(targetEl);
  const originalHtml =
    targetEl instanceof HTMLInputElement || targetEl instanceof HTMLTextAreaElement
      ? null
      : targetEl.innerHTML;
  const wasFocused = isFocusedWithin(targetEl);
  attachUndoInvalidation(targetEl);

  const reqId = ++requestSeq;
  activeRequestId = reqId;
  activeSnapshotText = originalText;
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

    const response = (await sendTranslateRequest({
      action: 'translateSelection',
      text,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage,
    })) as { success?: boolean; translatedText?: string; error?: string } | undefined;

    // Abort if cancelled or identity/text changed
    if (activeRequestId !== reqId) {
      console.debug('[AnyLLMTranslate:inline] response ignored - cancelled', reqId);
      return;
    }
    if (!isStillWritable(snapshotEl) || snapshotEl !== activeElement) {
      cancelActiveRequest('element-changed');
      return;
    }
    if (getElementText(snapshotEl) !== activeSnapshotText) {
      cancelActiveRequest('user-edited-after-response');
      return;
    }
    // The user moved to another field while we were translating: writing now
    // (or focusing the old field to write) would yank them back.
    if (wasFocused && !isFocusedWithin(snapshotEl)) {
      cancelActiveRequest('focus-lost');
      return;
    }

    if (response?.success && response.translatedText) {
      let out: string = response.translatedText;
      if (config.dualMode) {
        out = joinDualMode(text, response.translatedText, snapshotEl);
      }
      const write = await writeSafeAsync(snapshotEl, out);
      if (write.success) {
        undoMap.set(snapshotEl, { text: originalText, html: originalHtml });
        lastWrittenMap.set(snapshotEl, { text: out, at: Date.now() });
        snapshotEl.setAttribute('data-anyllm-inline-translated', '1');
        showToast(snapshotEl, 'Translated ✓', 'success');
      } else if (write.reason === 'framework-editor') {
        // The editor owns its DOM; writing would corrupt or be reverted.
        removeToast();
        showCopyPanel(snapshotEl, out, {
          message: "⚠ Can't edit this composer — copy the translation",
        });
        console.warn('[AnyLLMTranslate:inline] write-back refused: framework-owned editor');
      } else {
        removeToast();
        showCopyPanel(snapshotEl, out, { message: '⚠ Write failed — copy the translation' });
        console.warn('[AnyLLMTranslate:inline] write-back failed', write.reason);
      }
    } else {
      showToast(snapshotEl, '⚠ Translation failed', 'error');
      console.warn('[AnyLLMTranslate:inline] translation failed', response);
    }
  } catch (error) {
    if (activeRequestId === reqId && snapshotEl.isConnected) {
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
}

/**
 * Notify that the user typed in the active field — cancel if translating.
 * Our own synthetic write-back events must not cancel anything.
 */
export function onUserInputDuringTranslate(el: Element | null, event?: Event): void {
  if (!isTranslating || !activeElement) return;
  if (event && isSyntheticInlineEvent(event)) return;
  if (isWritingBack) return;
  if (el === activeElement || (el && activeElement.contains(el))) {
    cancelActiveRequest('user-input');
  }
}
