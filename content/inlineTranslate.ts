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

  let text = getElementText(el);
  text = stripTrailingTrigger(text, config.triggerKey, config.tapCount);
  text = text.trim();

  // Skip empty / whitespace-only inputs
  if (!text) return;

  // Store original for fallback undo
  const originalText = getElementText(el);
  undoMap.set(el, originalText);

  // First, replace the trailing trigger characters in the field immediately
  replaceElementText(el, text);

  isTranslating = true;
  addPulsingBorder(el);
  showToast(el, 'Translating...', 'loading');

  try {
    const settings = await loadSettings();

    const response = await chrome.runtime.sendMessage({
      action: 'translateSelection',
      text,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
    });

    if (response?.success && response.translatedText) {
      replaceElementText(el, response.translatedText);
      showToast(el, 'Translated ✓', 'success');
    } else {
      // Restore original on failure
      replaceElementText(el, originalText);
      showToast(el, '⚠ Translation failed', 'error');
    }
  } catch {
    // Restore original on error
    replaceElementText(el, originalText);
    showToast(el, '⚠ Translation failed', 'error');
  } finally {
    isTranslating = false;
    removePulsingBorder(el);
    // Auto-dismiss toast after 2 seconds
    setTimeout(removeToast, 2000);
  }
}

/* ── Keydown Listener ─────────────────────────────────────────── */

function onKeyDown(event: KeyboardEvent): void {
  if (!config.enabled) return;

  // Only handle the configured trigger key
  if (event.key !== config.triggerKey) {
    keyTimestamps = [];
    return;
  }

  const target = event.target as Element | null;

  // Guard: must be an editable element
  if (!isEditableElement(target)) {
    keyTimestamps = [];
    return;
  }

  // Guard: skip password fields
  if (isPasswordField(target)) {
    keyTimestamps = [];
    return;
  }

  // Guard: skip code editors
  if (isCodeEditor(target)) {
    keyTimestamps = [];
    return;
  }

  // Guard: debounce during translation
  if (isTranslating) return;

  const now = Date.now();
  keyTimestamps.push(now);

  // Keep only timestamps within the time window
  keyTimestamps = keyTimestamps.filter((t) => now - t <= config.timeWindowMs);

  if (keyTimestamps.length >= config.tapCount) {
    keyTimestamps = [];
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
  document.addEventListener('keydown', onKeyDown, true);

  return () => {
    document.removeEventListener('keydown', onKeyDown, true);
    removeToast();
    keyTimestamps = [];
  };
}

// Test helpers — only exported for testing
export { undoMap, removeToast, PULSING_CLASS, TOAST_CLASS, activeToast };
