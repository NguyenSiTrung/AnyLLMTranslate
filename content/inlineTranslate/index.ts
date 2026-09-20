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
  isPasswordField,
  resolveEditableHost,
} from './editable';
import { createGestureController, isTriggerKey, type GestureController } from './gesture';
import {
  isCurrentPageBlocked,
  resolveBlocklistPatterns,
} from './blocklist';
import { removeToast, getActiveToast } from './feedback';
import { isSyntheticInlineEvent, replaceElementText } from './writeback';
import {
  cancelActiveRequest,
  isInlineTranslating,
  onUserInputDuringTranslate,
  runInlineTranslate,
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
        // Shadow DOM: event.target is retargeted to the host, so resolve the
        // deepest node to find composers inside web components.
        resolveTarget: resolveEventTarget,
      },
    );
  }
  return gesture;
}

/**
 * Resolve the deepest event target, crossing shadow boundaries.
 *
 * `event.target` is retargeted to the shadow *host* for events that cross a
 * shadow root, which made composers inside web components look non-editable.
 */
export function resolveEventTarget(event: Event): Element | null {
  try {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : null;
    const first = path && path.length > 0 ? path[0] : event.target;
    return first instanceof Element ? first : null;
  } catch {
    return event.target instanceof Element ? event.target : null;
  }
}

function onKeyDown(event: KeyboardEvent): void {
  // Cancel-on-type: any non-trigger key while translating
  if (isInlineTranslating() && !isTriggerKey(event, config.triggerKey)) {
    onUserInputDuringTranslate(resolveEventTarget(event), event);
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
  // Our own write-back events must not cancel the request they belong to.
  if (isSyntheticInlineEvent(event)) return;
  if (isInlineTranslating()) {
    onUserInputDuringTranslate(resolveEventTarget(event), event);
  }
  ensureGesture().onInput(event);
}

/**
 * Cancel when focus moves off the field we are translating — writing later
 * would either land in a stale field or drag focus back from where the user
 * moved on to.
 */
function onFocusIn(event: Event): void {
  if (!isInlineTranslating()) return;
  const target = resolveEventTarget(event);
  const active = getDeepActiveElement(document, true);
  if (!active || target == null) return;
  if (target === active || active.contains(target)) return;
  cancelActiveRequest('focus-lost');
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
  const detach = (): void => {
    if (!listenersAttached) return;
    window.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('compositionstart', onCompositionStart, true);
    document.removeEventListener('compositionend', onCompositionEnd, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('focusin', onFocusIn, true);
    gesture?.dispose();
    gesture = null;
    removeToast();
    cancelActiveRequest('cleanup');
    listenersAttached = false;
  };

  if (listenersAttached) {
    // Already live — return a real cleanup so callers can still tear down.
    return detach;
  }
  ensureGesture();

  // Dual capture: window + document (Google Search stopImmediatePropagation).
  // Capture phase + early attach so page handlers cannot swallow the gesture.
  window.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('compositionstart', onCompositionStart, true);
  document.addEventListener('compositionend', onCompositionEnd, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('focusin', onFocusIn, true);
  listenersAttached = true;

  console.log('[AnyLLMTranslate:inline] Initialized — config:', { ...config });

  return detach;
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
} from './editable';
export {
  isFrameworkOwnedEditor,
  isFocusedWithin,
  readContentEditableText,
  isPlaceholderNode,
} from './editable';
export { replaceElementText };
export { undoMap, isInlineTranslating, tryFallbackUndo, cancelActiveRequest, lastWrittenMap } from './orchestrate';
export { PULSING_CLASS, TOAST_CLASS, COPY_PANEL_CLASS, removeToast, getActiveToast, showCopyPanel, removeCopyPanel } from './feedback';
export { isUrlBlocked, isCurrentPageBlocked, resolveBlocklistPatterns } from './blocklist';
export { joinDualMode, writeElementText, writeElementTextAsync, verifyWrite, isSyntheticInlineEvent } from './writeback';
export { createGestureController, isTriggerKey, isTriggerInsertData } from './gesture';
export { parseLanguagePrefix } from '@/lib/inlineTranslatePrefix';


/** Test helper: activeToast alias */
export const activeToast = {
  get current() {
    return getActiveToast();
  },
};
