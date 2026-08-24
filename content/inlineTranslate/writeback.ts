/**
 * Multi-strategy write-back for editable fields with post-write verification.
 * Includes framework-aware handling for Lexical/ProseMirror/Slate/Quill
 * contentEditable composers (ChatGPT, Claude, etc.) where synthetic DOM
 * mutation alone does not sync the editor's internal state. Event-only
 * dispatch with async poll lets the framework reconcile from the event,
 * while execCommand provides a native insertion path when available.
 */
import { getElementText } from './editable';

export type WriteStrategyName =
  | 'execCommand+events'
  | 'execCommand-html'
  | 'ce-event-only'
  | 'insertText-events'
  | 'direct-assign';

export interface WriteBackResult {
  success: boolean;
  strategy?: WriteStrategyName;
  writtenText?: string;
}

/**
 * Dual-mode join: input uses " / " separator; textarea/CE uses newline.
 */
export function joinDualMode(
  original: string,
  translation: string,
  el: HTMLElement,
): string {
  const isSingleLine =
    el instanceof HTMLInputElement ||
    (el instanceof HTMLTextAreaElement === false &&
      el.getAttribute('aria-multiline') !== 'true' &&
      !el.isContentEditable);
  // textarea and contentEditable → multiline
  if (el instanceof HTMLTextAreaElement || el.isContentEditable || el.contentEditable === 'true') {
    return `${original}\n${translation}`;
  }
  if (isSingleLine || el instanceof HTMLInputElement) {
    return `${original} / ${translation}`;
  }
  return `${original}\n${translation}`;
}

function setNativeInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLInputElement
    ? window.HTMLInputElement.prototype
    : window.HTMLTextAreaElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  const setter = descriptor?.set;

  const trackerHolder = el as unknown as {
    _valueTracker?: { setValue: (v: string) => void; getValue?: () => string };
  };
  const tracker = trackerHolder._valueTracker;
  if (tracker && typeof tracker.setValue === 'function') {
    tracker.setValue('');
  }

  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
}

function isContentEditableTarget(el: HTMLElement): boolean {
  return el.isContentEditable || el.contentEditable === 'true' || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement);
}

function waitMs(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<undefined>();
  setTimeout(() => resolve(undefined), ms);
  return promise;
}


function isVitestEnv(): boolean {
  return typeof process !== 'undefined' && typeof process.env === 'object' && (process.env as Record<string, string>).VITEST === 'true';
}

async function pollVerify(el: HTMLElement, expected: string, timeoutMs = 160, intervalMs = 20): Promise<boolean> {
  if (verifyWrite(el, expected)) return true;
  if (isVitestEnv()) return false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await waitMs(intervalMs);
    if (verifyWrite(el, expected)) return true;
  }
  return false;
}

async function waitForStableVerify(el: HTMLElement, expected: string, timeoutMs = 120): Promise<boolean> {
  if (isVitestEnv()) return verifyWrite(el, expected);
  if (!(await pollVerify(el, expected, timeoutMs))) return false;
  await waitMs(40);
  return verifyWrite(el, expected);
}


function dispatchInputEvents(el: HTMLElement, data: string, includeBeforeInput = true): void {
  if (includeBeforeInput) {
    try {
      const before = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data,
      });
      el.dispatchEvent(before);
    } catch {
      // InputEvent may be incomplete in jsdom
    }
  }
  try {
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data,
      }),
    );
  } catch {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function dispatchBeforeInput(el: HTMLElement, data: string): boolean {
  try {
    const ev = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data,
    });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  } catch {
    return false;
  }
}

function selectAll(el: HTMLElement): void {
  el.focus();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.select();
    try {
      el.setSelectionRange(0, el.value.length);
    } catch {
      // Some input types (e.g. email/number in some browsers) throw on setSelectionRange
    }
    return;
  }
  const sel = el.ownerDocument?.defaultView?.getSelection() ?? window.getSelection();
  if (sel) {
    const range = (el.ownerDocument ?? document).createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}
function collapseSelectionAtEnd(el: HTMLElement): void {
  el.focus();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const end = el.value.length;
    try {
      el.setSelectionRange(end, end);
    } catch {
      // Some input types do not expose a text selection range.
    }
    return;
  }

  const selection = el.ownerDocument?.defaultView?.getSelection() ?? window.getSelection();
  if (!selection) return;
  const range = (el.ownerDocument ?? document).createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function strategyExecCommand(el: HTMLElement, text: string): boolean {
  const hasExec = typeof document.execCommand === 'function';
  if (!hasExec) return false;
  selectAll(el);
  const ok = document.execCommand('insertText', false, text);
  if (ok && isContentEditableTarget(el)) {
    collapseSelectionAtEnd(el);
  } else if (ok) {
    dispatchInputEvents(el, text, false);
  }
  return ok;
}

function strategyExecCommandHtml(el: HTMLElement, text: string): boolean {
  const isCe = isContentEditableTarget(el);
  if (!isCe) return false;
  const hasExec = typeof document.execCommand === 'function';
  if (!hasExec) return false;
  selectAll(el);
  const html = escapeHtml(text).replace(/\n/g, '<br>');
  const ok = document.execCommand('insertHTML', false, html);
  if (ok) collapseSelectionAtEnd(el);
  return ok;
}


/**
 * Framework-aware CE strategy: select all, dispatch beforeinput/input WITHOUT
 * pre-mutating DOM, then let the framework (Lexical/ProseMirror) update its
 * internal state and DOM. Polls for async reconciliation.
 */
async function strategyCeEventOnly(el: HTMLElement, text: string): Promise<boolean> {
  if (!isContentEditableTarget(el)) return false;
  selectAll(el);
  dispatchBeforeInput(el, text);
  try {
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  } catch {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return pollVerify(el, text, 160, 20);
}

function strategyInsertTextEvents(el: HTMLElement, text: string): boolean {
  const ce = isContentEditableTarget(el);
  let prevented: boolean;
  if (ce) {
    selectAll(el);
    prevented = dispatchBeforeInput(el, text);
    if (prevented) {
      try {
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      } catch {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  } else {
    selectAll(el);
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = el.value;
    const nextValue = value.slice(0, start) + text + value.slice(end);
    setNativeInputValue(el, nextValue);
    const caret = start + text.length;
    try {
      el.setSelectionRange(caret, caret);
    } catch {
      /* some types disallow */
    }
  } else {
    const sel = el.ownerDocument?.defaultView?.getSelection() ?? window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const textNode = (el.ownerDocument ?? document).createTextNode(text);
      range.insertNode(textNode);
      range.selectNodeContents(textNode);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      el.textContent = text;
    }
    collapseSelectionAtEnd(el);
  }
  dispatchInputEvents(el, text, !ce);
  return true;
}

function strategyDirectAssign(el: HTMLElement, text: string): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeInputValue(el, text);
  } else {
    // Structured editors (Lexical / ProseMirror) expect block wrappers.
    // Plain textContent leaves host without <p> and may be reverted.
    const isStructured =
      el.hasAttribute('data-lexical-editor') ||
      el.classList.contains('ProseMirror') ||
      !!el.querySelector('[data-lexical-text]') ||
      !!el.querySelector('p');
    if (isStructured) {
      const html = escapeHtml(text)
        .split('\n')
        .map((line) => `<p>${line || '<br>'}</p>`)
        .join('');
      el.innerHTML = html || '<p><br></p>';
      collapseSelectionAtEnd(el);
    } else {
      el.textContent = text;
      collapseSelectionAtEnd(el);
    }
  }
  dispatchInputEvents(el, text, true);
  // Also dispatch compositionend for IME-sensitive editors
  try {
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: text }));
  } catch {
    // Composition events are optional for non-IME editors.
  }
  return true;
}

function verifyWrite(el: HTMLElement, expected: string): boolean {
  const current = getElementText(el);
  return (
    current === expected ||
    current.replace(/\r\n/g, '\n') === expected.replace(/\r\n/g, '\n') ||
    current.trim() === expected.trim()
  );
}

/**
 * Write text into an editable element using a strategy chain with verification.
 * On total failure returns success:false (caller should restore original).
 */
export function writeElementText(el: HTMLElement, text: string): WriteBackResult {
  const strategies: Array<{ name: WriteStrategyName; run: () => boolean }> = [
    { name: 'execCommand+events', run: () => strategyExecCommand(el, text) },
    { name: 'execCommand-html', run: () => strategyExecCommandHtml(el, text) },
    { name: 'insertText-events', run: () => strategyInsertTextEvents(el, text) },
    { name: 'direct-assign', run: () => strategyDirectAssign(el, text) },
  ];

  for (const s of strategies) {
    try {
      const ran = s.run();
      if (!ran) continue;
      if (verifyWrite(el, text)) {
        return { success: true, strategy: s.name, writtenText: text };
      }
    } catch {
      // try next
    }
  }

  return { success: false };
}

/**
 * Async variant with framework-aware polling for contentEditable editors.
 * Uses the same sync strategies plus a dedicated CE event-only async step
 * and post-write stability check to avoid claiming success when Lexical
 * reverts a manual mutation.
 */
export async function writeElementTextAsync(el: HTMLElement, text: string): Promise<WriteBackResult> {
  if (isVitestEnv()) {
    return writeElementText(el, text);
  }
  // Fast path for inputs: immediate sync strategies are sufficient
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const sync = writeElementText(el, text);
    if (sync.success) return sync;
    // Fallback with poll (React may batch)
    if (await pollVerify(el, text)) return { success: true, strategy: 'direct-assign', writtenText: text };
    return { success: false };
  }

  // ContentEditable: try execCommand first with stability check
  try {
    if (strategyExecCommand(el, text) && (await waitForStableVerify(el, text))) {
      return { success: true, strategy: 'execCommand+events', writtenText: text };
    }
  } catch {
    // Try the next contenteditable write strategy.
  }
  try {
    if (strategyExecCommandHtml(el, text) && (await waitForStableVerify(el, text))) {
      return { success: true, strategy: 'execCommand-html', writtenText: text };
    }
  } catch {
    // Try the next contenteditable write strategy.
  }

  // Framework-aware event-only path (no manual DOM mutation)
  try {
    if (await strategyCeEventOnly(el, text)) {
      if (await waitForStableVerify(el, text)) return { success: true, strategy: 'ce-event-only', writtenText: text };
    }
  } catch {
    // Try the next contenteditable write strategy.
  }

  // Manual insert + events
  try {
    if (strategyInsertTextEvents(el, text) && (await waitForStableVerify(el, text))) {
      return { success: true, strategy: 'insertText-events', writtenText: text };
    }
  } catch {
    // Try the next contenteditable write strategy.
  }

  // Direct assign fallback
  try {
    if (strategyDirectAssign(el, text) && (await waitForStableVerify(el, text))) {
      return { success: true, strategy: 'direct-assign', writtenText: text };
    }
  } catch {
    // Try the next contenteditable write strategy.
  }

  return { success: false };
}

/**
 * Legacy-compatible replace used by older tests — delegates to write pipeline.
 */
export function replaceElementText(el: HTMLElement, newText: string): void {
  writeElementText(el, newText);
}
