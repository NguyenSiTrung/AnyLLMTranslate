/**
 * Multi-strategy write-back for editable fields with post-write verification.
 */

import { getElementText } from './editable';

export type WriteStrategyName =
  | 'execCommand+events'
  | 'execCommand-html'
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

  // React 15/16/17/18/19 internal value tracker reset so React detects the change
  const tracker = (el as unknown as { _valueTracker?: { setValue: (v: string) => void; getValue?: () => string } })._valueTracker;
  if (tracker && typeof tracker.setValue === 'function') {
    tracker.setValue('');
  }

  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
}

function dispatchInputEvents(el: HTMLElement, data: string, includeBeforeInput = true): void {
  if (includeBeforeInput) {
    try {
      el.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data,
        }),
      );
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
  if (ok) {
    // execCommand natively dispatches beforeinput & input.
    // Dispatch input & change for frameworks (React/Vue) without duplicating beforeinput.
    dispatchInputEvents(el, text, false);
  }
  return ok;
}

function strategyExecCommandHtml(el: HTMLElement, text: string): boolean {
  const isCe =
    el.isContentEditable ||
    el.contentEditable === 'true' ||
    !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement);
  if (!isCe) return false;
  const hasExec = typeof document.execCommand === 'function';
  if (!hasExec) return false;
  selectAll(el);
  const html = escapeHtml(text).replace(/\n/g, '<br>');
  const ok = document.execCommand('insertHTML', false, html);
  if (ok) {
    dispatchInputEvents(el, text, false);
  }
  return ok;
}

function strategyInsertTextEvents(el: HTMLElement, text: string): boolean {
  // Simulate insert without execCommand: assign after select
  selectAll(el);
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
  }
  dispatchInputEvents(el, text, true);
  return true;
}

function strategyDirectAssign(el: HTMLElement, text: string): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeInputValue(el, text);
  } else {
    el.textContent = text;
  }
  dispatchInputEvents(el, text, true);
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
 * Legacy-compatible replace used by older tests — delegates to write pipeline.
 */
export function replaceElementText(el: HTMLElement, newText: string): void {
  writeElementText(el, newText);
}
