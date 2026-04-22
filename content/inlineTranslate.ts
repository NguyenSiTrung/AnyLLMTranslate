/**
 * Inline Translation — detects a rapid key-press gesture in editable fields,
 * sends the field's text for translation, and replaces it in-place with
 * native undo support (execCommand).
 *
 * Visual feedback: pulsing border on the active field + floating toast.
 */

import { loadSettings } from '@/lib/config';

/* ── Types ────────────────────────────────────────────────────── */

export interface InlineTranslateConfig {
  enabled: boolean;
  triggerKey: string;
  tapCount: number;
  timeWindowMs: number;
}

const DEFAULT_CONFIG: InlineTranslateConfig = {
  enabled: true,
  triggerKey: ' ',
  tapCount: 3,
  timeWindowMs: 500,
};

/* ── State ────────────────────────────────────────────────────── */

let config: InlineTranslateConfig = { ...DEFAULT_CONFIG };
let keyTimestamps: number[] = [];
let isTranslating = false;

/** Fallback undo map: element → original text before last translation */
const undoMap = new WeakMap<Element, string>();

/**
 * Dedup guard — because we register on both `window` and `document` (capture),
 * the same KeyboardEvent propagates through both listeners. This WeakSet
 * ensures each event is processed exactly once.
 */
const processedEventIds = new Map<string, number>();
const DEDUP_WINDOW_MS = 50;

/* ── Guards ───────────────────────────────────────────────────── */

/** Check if an element is an editable field we should handle */
export function isEditableElement(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;

  // contentEditable (check both property and attribute for jsdom compatibility)
  if (el.isContentEditable || el.contentEditable === 'true') return true;

  if (el instanceof HTMLTextAreaElement) return true;

  if (el instanceof HTMLInputElement) {
    const editableTypes = ['text', 'search', 'url', 'email', 'tel'];
    return editableTypes.includes(el.type);
  }

  return false;
}

/** Check if the element is a password field */
function isPasswordField(el: Element): boolean {
  return el instanceof HTMLInputElement && el.type === 'password';
}

/** Check if the element is inside a code editor */
export function isCodeEditor(el: Element): boolean {
  const editorClasses = [
    'monaco-editor', 'CodeMirror', 'ace_editor', 'cm-editor',
    'cm-content', 'ace_text-input',
  ];

  let current: Element | null = el;
  while (current) {
    if (current.classList) {
      for (const cls of editorClasses) {
        if (current.classList.contains(cls)) return true;
      }
    }
    // Check role attribute for code-specific textboxes
    if (
      current.getAttribute('role') === 'textbox' &&
      (current.getAttribute('aria-multiline') === 'true' ||
        current.getAttribute('data-mode-id') != null)
    ) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

/* ── Text extraction / replacement ────────────────────────────── */

/** Get text content from an editable element */
export function getElementText(el: HTMLElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  // contentEditable
  return el.textContent ?? '';
}

/** Replace text using execCommand to preserve native undo (Ctrl+Z) */
export function replaceElementText(el: HTMLElement, newText: string): void {
  const hasExecCommand = typeof document.execCommand === 'function';

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus();
    el.select();
    if (hasExecCommand) {
      // Insert replacement — this is undoable via Ctrl+Z
      document.execCommand('insertText', false, newText);
    } else {
      // Fallback: direct assignment (no native undo, but works in test env)
      el.value = newText;
    }
  } else if (el.isContentEditable) {
    el.focus();
    if (hasExecCommand) {
      document.execCommand('selectAll', false, undefined);
      document.execCommand('insertText', false, newText);
    } else {
      el.textContent = newText;
    }
  }

  // Dispatch synthetic events so frameworks detect the change
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Strip trailing trigger characters from text */
function stripTrailingTrigger(text: string, key: string, count: number): string {
  // Remove the trailing trigger characters (e.g. extra spaces from triple-space)
  let result = text;
  for (let i = 0; i < count; i++) {
    if (result.endsWith(key)) {
      result = result.slice(0, -key.length);
    }
  }
  return result;
}

/* ── Visual Feedback ──────────────────────────────────────────── */

const PULSING_CLASS = 'anyllm-inline-translating';
const TOAST_CLASS = 'anyllm-inline-toast';

let activeToast: HTMLElement | null = null;

/** Add pulsing border to element */
function addPulsingBorder(el: HTMLElement): void {
  el.classList.add(PULSING_CLASS);
}

/** Remove pulsing border from element */
function removePulsingBorder(el: HTMLElement): void {
  el.classList.remove(PULSING_CLASS);
}

/** Show a floating toast near the element */
function showToast(el: HTMLElement, message: string, type: 'loading' | 'success' | 'error'): void {
  removeToast();

  const toast = document.createElement('div');
  toast.className = TOAST_CLASS;
  toast.setAttribute('data-anyllm-role', 'inline-toast');
  toast.setAttribute('data-type', type);
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  // Position near the element
  const rect = el.getBoundingClientRect();
  toast.style.position = 'fixed';
  toast.style.left = `${rect.left}px`;
  toast.style.top = `${rect.top - 36}px`;
  toast.style.zIndex = '2147483647';

  // Ensure toast is visible if element is near top of viewport
  if (rect.top < 40) {
    toast.style.top = `${rect.bottom + 4}px`;
  }

  document.body.appendChild(toast);
  activeToast = toast;
}

/** Remove the active toast */
function removeToast(): void {
  if (activeToast) {
    activeToast.remove();
    activeToast = null;
  }
}

/* ── Core Gesture Handler ─────────────────────────────────────── */

async function handleGestureTrigger(el: HTMLElement): Promise<void> {
  if (isTranslating) return;

  // Re-acquire the element if the originally captured target has been detached
  // or is no longer editable (common on SPAs like Google Search that re-render
  // the search box after our capture-phase keydown handler ran).
  let targetEl = el;
  if (!targetEl.isConnected || !isEditableElement(targetEl)) {
    const active = document.activeElement;
    if (active instanceof HTMLElement && isEditableElement(active)) {
      targetEl = active;
    } else {
      console.debug('[AnyLLMTranslate:inline] gesture ignored - target detached');
      return;
    }
  }

  let text = getElementText(targetEl);
  text = stripTrailingTrigger(text, config.triggerKey, config.tapCount);
  text = text.trim();

  // Skip empty / whitespace-only inputs, but give the user visible feedback
  // so the gesture is not silently eaten (e.g. mashing space in an empty box).
  if (!text) {
    console.debug('[AnyLLMTranslate:inline] gesture ignored - empty text');
    showToast(targetEl, '⚠ Type something first', 'error');
    setTimeout(removeToast, 2000);
    return;
  }

  console.debug('[AnyLLMTranslate:inline] starting translation', { text, length: text.length });

  // Store original for fallback undo
  const originalText = getElementText(targetEl);
  undoMap.set(targetEl, originalText);

  // First, replace the trailing trigger characters in the field immediately
  replaceElementText(targetEl, text);

  isTranslating = true;
  addPulsingBorder(targetEl);
  showToast(targetEl, 'Translating...', 'loading');

  try {
    const settings = await loadSettings();
    console.debug('[AnyLLMTranslate:inline] sending translation request', {
      text,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.inlineTranslate.targetLanguage,
    });

    const response = await chrome.runtime.sendMessage({
      action: 'translateSelection',
      text,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.inlineTranslate.targetLanguage,
    });

    console.debug('[AnyLLMTranslate:inline] received response', response);

    if (response?.success && response.translatedText) {
      replaceElementText(targetEl, response.translatedText);
      showToast(targetEl, 'Translated ✓', 'success');
    } else {
      // Restore original on failure
      replaceElementText(targetEl, originalText);
      showToast(targetEl, '⚠ Translation failed', 'error');
      console.warn('[AnyLLMTranslate:inline] translation failed', response);
    }
  } catch (error) {
    // Restore original on error
    replaceElementText(targetEl, originalText);
    showToast(targetEl, '⚠ Translation failed', 'error');
    console.error('[AnyLLMTranslate:inline] translation error', error);
  } finally {
    isTranslating = false;
    removePulsingBorder(targetEl);
    // Auto-dismiss toast after 2 seconds
    setTimeout(removeToast, 2000);
  }
}

/* ── Keydown Listener ─────────────────────────────────────────── */

function onKeyDown(event: KeyboardEvent): void {
  // Dedup: we listen on both window + document (capture). Process each event once.
  const dedupKey = `${event.timeStamp}-${event.key}-${event.type}`;
  const lastSeen = processedEventIds.get(dedupKey);
  if (lastSeen && Date.now() - lastSeen < DEDUP_WINDOW_MS) return;
  processedEventIds.set(dedupKey, Date.now());

  if (!config.enabled) {
    return;
  }

  // Only handle the configured trigger key
  if (event.key !== config.triggerKey) {
    keyTimestamps = [];
    return;
  }

  const target = event.target as Element | null;

  // Guard: must be an editable element
  if (!isEditableElement(target)) {
    console.debug('[AnyLLMTranslate:inline] key press ignored - not an editable element', {
      target: target?.tagName,
      isEditable: false,
    });
    keyTimestamps = [];
    return;
  }

  // Guard: skip password fields
  if (isPasswordField(target)) {
    console.debug('[AnyLLMTranslate:inline] key press ignored - password field');
    keyTimestamps = [];
    return;
  }

  // Guard: skip code editors
  if (isCodeEditor(target)) {
    console.debug('[AnyLLMTranslate:inline] key press ignored - code editor');
    keyTimestamps = [];
    return;
  }

  // Guard: debounce during translation
  if (isTranslating) {
    console.debug('[AnyLLMTranslate:inline] key press ignored - already translating');
    return;
  }

  // Guard: don't count trigger taps on empty / whitespace-only fields. This
  // prevents the gesture from being silently consumed when the user mashes
  // the spacebar before typing anything.
  if (!getElementText(target).trim()) {
    console.debug('[AnyLLMTranslate:inline] key press ignored - empty field');
    keyTimestamps = [];
    return;
  }

  const now = Date.now();
  keyTimestamps.push(now);

  // Keep only timestamps within the time window
  keyTimestamps = keyTimestamps.filter((t) => now - t <= config.timeWindowMs);

  console.debug('[AnyLLMTranslate:inline] key tap', {
    count: keyTimestamps.length,
    needed: config.tapCount,
    windowMs: config.timeWindowMs,
    target: target.tagName,
    targetType: (target as HTMLInputElement).type ?? 'N/A',
  });

  if (keyTimestamps.length >= config.tapCount) {
    keyTimestamps = [];
    console.debug('[AnyLLMTranslate:inline] gesture triggered!');
    // Trigger translation after a microtask to let the key input land in the field
    setTimeout(() => handleGestureTrigger(target), 0);
  }
}

/* ── Public API ───────────────────────────────────────────────── */

/** Update the inline translate configuration at runtime */
export function updateInlineTranslateConfig(partial: Partial<InlineTranslateConfig>): void {
  config = { ...config, ...partial };
  // Reset gesture state on config change
  keyTimestamps = [];
}

/** Set enabled/disabled state */
export function setInlineTranslateEnabled(enabled: boolean): void {
  config.enabled = enabled;
  if (!enabled) {
    keyTimestamps = [];
    removeToast();
  }
}

/** Get current configuration (for testing) */
export function getInlineTranslateConfig(): InlineTranslateConfig {
  return { ...config };
}

/** Check if currently translating (for testing) */
export function isInlineTranslating(): boolean {
  return isTranslating;
}

/** Initialize the inline translate feature. Returns a cleanup function. */
export function initInlineTranslate(): () => void {
  // Register on both `window` and `document` in capture phase. Some sites
  // (e.g. Google Search) install capture-phase listeners on `window` that
  // call `stopImmediatePropagation()` — listening at window ensures we still
  // see the event. The `processedEvents` WeakSet guarantees each event is
  // processed exactly once across both listeners.
  window.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  console.log('[AnyLLMTranslate:inline] Initialized — config:', { ...config });

  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    removeToast();
    keyTimestamps = [];
  };
}

// Test helpers — only exported for testing
export { undoMap, removeToast, PULSING_CLASS, TOAST_CLASS, activeToast };
