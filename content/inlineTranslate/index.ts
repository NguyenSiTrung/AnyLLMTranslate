/**
 * Inline Translation — public API.
 *
 * Detects a rapid key-press gesture (or Alt+I command) in editable fields,
 * sends the field's text for translation, and replaces it with multi-strategy
 * write-back, race-safe abort, language prefix, and site blocklist.
 */

import {
  DEFAULT_INLINE_TRANSLATE_SETTINGS,
  type InlineTranslateSettings,
} from '@/types/config';
import {
  getDeepActiveElement,
  getElementText,
  isCaretAtEnd,
  isCodeEditor,
  isEditableElement,
  isPasswordField,
  resolveEditableHost,
} from './editable';
import { createGestureController, isTriggerKey, type GestureController } from './gesture';
import {
  isCurrentPageBlocked,
  resolveBlocklistPatterns,
} from './blocklist';
import { removeToast, PULSING_CLASS, TOAST_CLASS, getActiveToast } from './feedback';
import { replaceElementText } from './writeback';
import {
  cancelActiveRequest,
  isInlineTranslating,
  onUserInputDuringTranslate,
  runInlineTranslate,
  tryFallbackUndo,
  undoMap,
} from './orchestrate';
import {
  DEFAULT_RUNTIME_CONFIG,
  type InlineTranslateRuntimeConfig,
} from './types';

export type { InlineTranslateRuntimeConfig };

/** @deprecated Use InlineTranslateRuntimeConfig — kept for test compatibility */
export type InlineTranslateConfig = InlineTranslateRuntimeConfig;

let config: InlineTranslateRuntimeConfig = {
  ...DEFAULT_RUNTIME_CONFIG,
  blocklistPatterns: [...DEFAULT_INLINE_TRANSLATE_SETTINGS.blocklistPatterns],
};

let gesture: GestureController | null = null;
let listenersAttached = false;

function settingsToRuntime(
  partial: Partial<InlineTranslateSettings | InlineTranslateRuntimeConfig>,
): Partial<InlineTranslateRuntimeConfig> {
  const mapped: Partial<InlineTranslateRuntimeConfig> = { ...partial };
  if (partial.blocklistPatterns) {
    mapped.blocklistPatterns = resolveBlocklistPatterns(partial.blocklistPatterns);
  } else {
    // Avoid overwriting existing blocklist with undefined on partial updates
    delete mapped.blocklistPatterns;
  }
  return mapped;
}

function isBlocked(): boolean {
  const patterns = resolveBlocklistPatterns(config.blocklistPatterns);
  return isCurrentPageBlocked(patterns);
}

function shouldAccept(el: Element | null): el is HTMLElement {
  const host = resolveEditableHost(el);
  if (!host) return false;
  if (isPasswordField(host)) return false;
  if (isCodeEditor(host)) return false;
  return true;
}

/**
 * Gesture callbacks receive event.target; normalize to the editable host
 * so write-back hits the ProseMirror/Quill root, not a nested `<p>`.
 */
function resolveTriggerTarget(el: Element | null): HTMLElement | null {
  const host = resolveEditableHost(el);
  if (!host || !shouldAccept(host)) return null;
  return host;
}

function onTrigger(target: HTMLElement): void {
  if (isBlocked()) {
    console.debug('[AnyLLMTranslate:inline] blocked host — no-op');
    return;
  }
  const host = resolveTriggerTarget(target) ?? target;
  void runInlineTranslate(config, { element: host, skipStripTrailing: false });
}

function ensureGesture(): GestureController {
  if (!gesture) {
    gesture = createGestureController(
      {
        enabled: config.enabled,
        triggerKey: config.triggerKey,
        tapCount: config.tapCount,
        timeWindowMs: config.timeWindowMs,
        idleMs: config.idleMs,
        triggerGapMs: config.triggerGapMs,
        triggerToleranceCount: config.triggerToleranceCount,
      },
      {
        onTrigger,
        // Accept any descendant of an editable host (ProseMirror nested nodes)
        shouldAccept: (el): el is HTMLElement => resolveTriggerTarget(el) != null,
        // Caret / text checks must run on the host, not a nested child
        isCaretAtEnd: (el) => {
          const host = resolveEditableHost(el) ?? el;
          return isCaretAtEnd(host);
        },
        getText: (el) => {
          const host = resolveEditableHost(el) ?? el;
          return getElementText(host);
        },
      },
    );
  }
  return gesture;
}

function onKeyDown(event: KeyboardEvent): void {
  // Cancel-on-type: any non-trigger key while translating
  if (isInlineTranslating() && !isTriggerKey(event, config.triggerKey)) {
    onUserInputDuringTranslate(event.target as Element);
  }
  ensureGesture().onKeyDown(event);
}

function onCompositionStart(event: Event): void {
  ensureGesture().onCompositionStart(event);
}

function onCompositionEnd(event: Event): void {
  ensureGesture().onCompositionEnd(event);
}

function onInput(event: Event): void {
  // Ignore synthetic events from our own write-back (isWritingBack guard inside)
  if (isInlineTranslating()) {
    onUserInputDuringTranslate(event.target as Element);
  }
  ensureGesture().onInput(event);
}

/** Update the inline translate configuration at runtime */
export function updateInlineTranslateConfig(
  partial: Partial<InlineTranslateRuntimeConfig | InlineTranslateSettings>,
): void {
  const mapped = settingsToRuntime(partial);
  config = { ...config, ...mapped };
  // Drop undefined keys from partial merge of blocklist
  if (partial.blocklistPatterns) {
    config.blocklistPatterns = resolveBlocklistPatterns(partial.blocklistPatterns);
  }
  gesture?.setConfig({
    enabled: config.enabled,
    triggerKey: config.triggerKey,
    tapCount: config.tapCount,
    timeWindowMs: config.timeWindowMs,
    idleMs: config.idleMs,
    triggerGapMs: config.triggerGapMs,
    triggerToleranceCount: config.triggerToleranceCount,
  });
}

/** Set enabled/disabled state */
export function setInlineTranslateEnabled(enabled: boolean): void {
  config.enabled = enabled;
  gesture?.setConfig({ enabled });
  if (!enabled) {
    gesture?.reset();
    cancelActiveRequest('disabled');
    removeToast();
  }
}

/** Get current configuration (for testing) */
export function getInlineTranslateConfig(): InlineTranslateRuntimeConfig {
  const patterns = Array.isArray(config.blocklistPatterns)
    ? config.blocklistPatterns
    : [];
  return { ...config, blocklistPatterns: [...patterns] };
}

/**
 * Translate the currently focused deep-active editable (chrome.commands path).
 * Does not require trailing spaces.
 */
export async function translateFocusedInput(): Promise<void> {
  if (!config.enabled) return;
  if (isBlocked()) {
    console.debug('[AnyLLMTranslate:inline] blocked host — Alt+I no-op');
    return;
  }
  const deep = getDeepActiveElement(document, true);
  if (!(deep instanceof HTMLElement) || !shouldAccept(deep)) {
    console.debug('[AnyLLMTranslate:inline] Alt+I — no editable focus');
    return;
  }
  await runInlineTranslate(config, { element: deep, skipStripTrailing: true });
}

/** Initialize the inline translate feature. Returns a cleanup function. */
export function initInlineTranslate(): () => void {
  if (listenersAttached) {
    // Already live — return a real cleanup so callers can still tear down.
    return () => {
      if (!listenersAttached) return;
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('compositionstart', onCompositionStart, true);
      document.removeEventListener('compositionend', onCompositionEnd, true);
      document.removeEventListener('input', onInput, true);
      gesture?.dispose();
      gesture = null;
      removeToast();
      cancelActiveRequest('cleanup');
      listenersAttached = false;
    };
  }
  ensureGesture();

  // Dual capture: window + document (Google Search stopImmediatePropagation).
  // Capture phase + early attach so page handlers cannot swallow the gesture.
  window.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('compositionstart', onCompositionStart, true);
  document.addEventListener('compositionend', onCompositionEnd, true);
  document.addEventListener('input', onInput, true);
  listenersAttached = true;

  console.log('[AnyLLMTranslate:inline] Initialized — config:', { ...config });

  return () => {
    if (!listenersAttached) return;
    window.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('compositionstart', onCompositionStart, true);
    document.removeEventListener('compositionend', onCompositionEnd, true);
    document.removeEventListener('input', onInput, true);
    gesture?.dispose();
    gesture = null;
    removeToast();
    cancelActiveRequest('cleanup');
    listenersAttached = false;
  };
}

// Re-exports for tests and content script
export {
  isEditableElement,
  isCodeEditor,
  getElementText,
  getDeepActiveElement,
  isCaretAtEnd,
  isPasswordField,
  resolveEditableHost,
};
export { replaceElementText };
export { undoMap, isInlineTranslating, tryFallbackUndo, cancelActiveRequest };
export { PULSING_CLASS, TOAST_CLASS, removeToast, getActiveToast };
export { isUrlBlocked, isCurrentPageBlocked, resolveBlocklistPatterns } from './blocklist';
export { joinDualMode, writeElementText, writeElementTextAsync } from './writeback';
export { createGestureController, isTriggerKey, isTriggerInsertData } from './gesture';
export { parseLanguagePrefix } from '@/lib/inlineTranslatePrefix';


/** Test helper: activeToast alias */
export const activeToast = {
  get current() {
    return getActiveToast();
  },
};
