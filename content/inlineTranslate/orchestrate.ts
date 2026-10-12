/**
 * Race-safe orchestration: snapshot → translate → verify → write-back.
 *
 * The draft is never mutated before the translation arrives: a failed request
 * or a refused write must leave exactly what the user typed.
 */

import { loadSettings, updateSettings } from '@/lib/config';
import { formatGestureLabel } from '@/lib/shortcutDisplay';
import type { InlineTranslateSettings } from '@/types/config';
import { parseLanguagePrefix } from '@/lib/inlineTranslatePrefix';
import { detectLanguage, isSameLanguage } from '@/lib/langDetect';
import { getLanguageName } from '@/lib/languages';
import { resolveAutoTargetLanguage, type InlineLanguageSource } from './autoLanguage';
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
  removeCopyPanel,
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
import { passesTailGate, protectUrls, removeTail } from './tail';
import { hideLoadingOverlay, showLoadingOverlay } from './overlay';
import { hideLanguageBar, showLanguageBar } from './languageBar';
import {
  confirmLongText,
  needsLongTextConfirm,
  shouldShowFirstUseGuide,
  showFirstUseGuide,
} from './modals';
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
  /** What started the run; the first-use guide only follows a gesture. */
  trigger?: 'gesture' | 'shortcut' | 'retarget';
  /** Translate this draft instead of the field text (language-bar retarget). */
  sourceText?: string;
  /** Target language chosen outside the text (wins over a prefix). */
  targetLanguage?: string;
  /** Called when the user turns the feature off from the first-use guide. */
  onTurnOff?: () => void;
}

/** Original draft per element, captured before the first successful write. */
export interface UndoEntry {
  text: string;
  /** Original markup for contentEditable fields (null for input/textarea). */
  html: string | null;
}

/** Where the request's target language came from (language bar badge). */
export type InlineTargetSource = 'explicit' | InlineLanguageSource;

/** Fallback undo: element → original draft before the last translation */
export const undoMap = new WeakMap<Element, UndoEntry>();

/**
 * Last successful write-back per element. Fallback undo only runs when the
 * field still holds this value *and* the write happened recently. If the user
 * typed/deleted, re-trigger translates the new content instead of restoring the
 * original.
 */
export const lastWrittenMap = new WeakMap<
  Element,
  { text: string; at: number; targetLanguage?: string; source?: InlineTargetSource }
>();

/** Elements already watched for draft edits (listener attached once). */
const undoWatchAttached = new WeakSet<Element>();

let isTranslating = false;
/** A modal (guide / long-text confirm) is waiting for the user. */
let isPrompting = false;
/** The guide is shown once even before the settings round-trip lands. */
let guideShownThisSession = false;
/** True while our own write-back dispatches synthetic input/change events */
let isWritingBack = false;
let requestSeq = 0;
/** Active request id for cancel-on-type */
let activeRequestId = 0;
/** Snapshot text at request start for cancel detection */
let activeSnapshotText: string | null = null;
let activeElement: HTMLElement | null = null;
/** Trigger time and cancel window of the active request (FR-9). */
let activeTriggeredAt = 0;
let activeCancelWindowMs = 0;

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
  hideLoadingOverlay();
  if (activeElement) {
    clearFeedback(activeElement);
  } else {
    clearFeedback();
  }
  activeSnapshotText = null;
  activeElement = null;
}

/** Typing only cancels within `cancelWindowMs` of the trigger (refer `lde`). */
function isWithinCancelWindow(): boolean {
  return Date.now() - activeTriggeredAt <= activeCancelWindowMs;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

function sameText(a: string, b: string): boolean {
  return a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
}

/**
 * The draft was already in the target language and the model echoed it back
 * (refer `Pde`): nothing to write.
 */
function isAlreadyInTarget(source: string, result: string, targetLanguage: string): boolean {
  return sameText(source, result) && isSameLanguage(detectLanguage(source).lang, targetLanguage);
}

/** Persist inline settings chosen from in-page UI (bar, modals). */
async function persistInlineSettings(patch: Partial<InlineTranslateSettings>): Promise<void> {
  try {
    const settings = await loadSettings();
    await updateSettings({ inlineTranslate: { ...settings.inlineTranslate, ...patch } });
  } catch (error) {
    console.warn('[AnyLLMTranslate:inline] could not save settings', error);
  }
}

/** First-use guide (gesture only) and long-text confirm; false = do not translate. */
async function promptBeforeTranslate(
  config: InlineTranslateRuntimeConfig,
  options: OrchestrateOptions,
  textLength: number,
): Promise<boolean> {
  const needsGuide =
    options.trigger === 'gesture' && !guideShownThisSession && shouldShowFirstUseGuide(config);
  const needsConfirm = needsLongTextConfirm(textLength, config);
  if (!needsGuide && !needsConfirm) return true;

  isPrompting = true;
  try {
    if (needsGuide) {
      guideShownThisSession = true;
      const choice = await showFirstUseGuide({
        gestureLabel: formatGestureLabel(config.tapCount, config.triggerKey),
        shortcutLabel: 'Alt+I',
        persist: persistInlineSettings,
      });
      if (choice === 'off') {
        options.onTurnOff?.();
        return false;
      }
    }
    return needsConfirm ? await confirmLongText({ textLength, persist: persistInlineSettings }) : true;
  } finally {
    isPrompting = false;
  }
}

/** Language bar after a write: retarget re-translates the original draft. */
function openLanguageBar(
  config: InlineTranslateRuntimeConfig,
  el: HTMLElement,
  targetLanguage: string,
  source: InlineTargetSource,
): void {
  showLanguageBar({
    field: el,
    targetLanguage,
    source,
    getOriginalDraft: () => undoMap.get(el)?.text,
    isUnchanged: () =>
      el.getAttribute('data-anyllm-inline-translated') === '1' &&
      getElementText(el) === lastWrittenMap.get(el)?.text,
    onRetarget: (lang, draft) => {
      void runInlineTranslate(
        { ...config, targetLanguage: lang },
        {
          element: el,
          trigger: 'retarget',
          sourceText: draft,
          targetLanguage: lang,
          // Drafts sent with Alt+I have no trailing taps to strip.
          skipStripTrailing: !passesTailGate(draft, config.triggerKey, config.tapCount),
        },
      );
    },
    onUndo: () => {
      tryFallbackUndo(el);
    },
    persistTargetLanguage: (lang) => persistInlineSettings({ targetLanguage: lang }),
  });
}

/** Test helper: forget that the guide was shown in this page session. */
export function __resetInlinePromptsForTest(): void {
  guideShownThisSession = false;
  isPrompting = false;
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
  // One request at a time: a trigger while busy is dropped.
  if (isTranslating || isPrompting) return;
  let triggeredAt = Date.now();

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

  const isRetarget = options.sourceText != null;
  let rawText = options.sourceText ?? getElementText(targetEl);
  if (!options.skipStripTrailing) {
    const tailMatched = passesTailGate(rawText, config.triggerKey, config.tapCount);
    rawText = removeTail(rawText, config.triggerKey, config.tapCount, { tailMatched }).text;
  }

  // Snapshot identity before any mutation
  const snapshotEl = targetEl;

  // Language prefix
  // URLs are masked so `//xx`-style prefix parsing never matches inside one.
  const urlSafe = protectUrls(rawText.trimStart());
  const prefixResult = parseLanguagePrefix(urlSafe.text, {
    enabled: config.enableLanguagePrefix,
    prefixChar: config.languagePrefix,
    trailingKey: config.triggerKey,
  });
  const text = urlSafe.restore(prefixResult.body).trim();
  const targetLanguageOverride = options.targetLanguage ?? prefixResult.targetLang;

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
  if (config.enableFallbackUndo && !isRetarget) {
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

  if (!isRetarget) {
    if (!(await promptBeforeTranslate(config, options, text.length))) return;
    if (!targetEl.isConnected || isTranslating) return;
    // Pacing (cancel window, min duration) starts once the user confirmed.
    triggeredAt = Date.now();
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
  activeTriggeredAt = triggeredAt;
  activeCancelWindowMs = Math.max(0, config.cancelWindowMs ?? 0);
  isTranslating = true;
  hideLanguageBar();
  addPulsingBorder(targetEl);
  showLoadingOverlay(targetEl);
  // A fresh run supersedes any stale copy panel still floating near the field.
  removeCopyPanel();
  showToast(targetEl, 'Translating...', 'loading');

  try {
    const settings = await loadSettings();
    const defaultTarget =
      config.targetLanguage ?? settings.inlineTranslate?.targetLanguage ?? settings.targetLanguage;
    // explicit prefix → auto_selector → auto_page → default
    const resolvedTarget: { lang: string; source: InlineTargetSource } = targetLanguageOverride
      ? { lang: targetLanguageOverride, source: 'explicit' }
      : resolveAutoTargetLanguage(snapshotEl, {
          autoLanguageEnable: config.autoLanguageEnable !== false,
          autoLanguagePageEnable: config.autoLanguagePageEnable === true,
          autoLanguageSelectors: config.autoLanguageSelectors ?? [],
          targetLanguage: defaultTarget,
        });
    const targetLanguage = resolvedTarget.lang;

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

    // Keep the loading state for at least minDurationMs so a fast result does
    // not flash; typing inside the cancel window still cancels meanwhile.
    const holdMs = triggeredAt + Math.max(0, config.minDurationMs ?? 0) - Date.now();
    if (holdMs > 0 && activeRequestId === reqId) await sleep(holdMs);

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
      if (isAlreadyInTarget(text, response.translatedText, targetLanguage)) {
        showToast(snapshotEl, `Already in ${getLanguageName(targetLanguage)}`, 'success');
        return;
      }
      let out: string = response.translatedText;
      if (config.dualMode) {
        out = joinDualMode(text, response.translatedText, snapshotEl);
      }
      const write = await writeSafeAsync(snapshotEl, out);
      if (write.success) {
        // A retarget keeps the very first draft as the undo target.
        const undoEntry = isRetarget ? undoMap.get(snapshotEl) : { text: originalText, html: originalHtml };
        if (undoEntry) undoMap.set(snapshotEl, undoEntry);
        lastWrittenMap.set(snapshotEl, {
          text: out,
          at: Date.now(),
          targetLanguage,
          source: resolvedTarget.source,
        });
        snapshotEl.setAttribute('data-anyllm-inline-translated', '1');
        showToast(snapshotEl, 'Translated ✓', 'success');
        if (config.enableTargetLanguageBar !== false) {
          openLanguageBar(config, snapshotEl, targetLanguage, resolvedTarget.source);
        }
      } else if (write.reason === 'framework-editor') {
        // The editor owns its DOM and exposes no usable API; writing would
        // corrupt or be reverted — hand the translation over for a real paste.
        removeToast();
        showCopyPanel(snapshotEl, out, {
          message: "Can't edit this composer directly",
        });
        console.warn('[AnyLLMTranslate:inline] write-back refused: framework-owned editor');
      } else {
        removeToast();
        showCopyPanel(snapshotEl, out, {
          message: "Couldn't write the translation into this field",
        });
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
      hideLoadingOverlay();
      scheduleToastDismiss(2000);
    }
  }
}

/**
 * Notify that the user typed in the active field — cancel if translating and
 * still inside the cancel window. Our own synthetic write-back events must not
 * cancel anything. Later edits are caught by the pre-write draft check.
 */
export function onUserInputDuringTranslate(el: Element | null, event?: Event): void {
  if (!isTranslating || !activeElement) return;
  if (event && isSyntheticInlineEvent(event)) return;
  if (isWritingBack) return;
  if (!isWithinCancelWindow()) return;
  if (el === activeElement || (el && activeElement.contains(el))) {
    cancelActiveRequest('user-input');
  }
}
