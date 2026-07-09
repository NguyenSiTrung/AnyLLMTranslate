/**
 * Multi-strategy write-back for editable fields with post-write verification.
 */

import { getElementText } from './editable';

export type WriteStrategyName =
  | 'execCommand+events'
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

function dispatchInputEvents(el: HTMLElement, data: string): void {
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
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus();
    el.select();
    return;
  }
  el.focus();
  const hasExec = typeof document.execCommand === 'function';
  if (hasExec) {
    document.execCommand('selectAll', false, undefined);
  } else {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
}

function strategyExecCommand(el: HTMLElement, text: string): boolean {
  const hasExec = typeof document.execCommand === 'function';
  if (!hasExec) return false;
  selectAll(el);
  try {
    el.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text,
      }),
    );
  } catch {
    /* noop */
  }
  const ok = document.execCommand('insertText', false, text);
  if (ok) {
    dispatchInputEvents(el, text);
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
    el.value = value.slice(0, start) + text + value.slice(end);
    const caret = start + text.length;
    try {
      el.setSelectionRange(caret, caret);
    } catch {
      /* some types disallow */
    }
  } else {
    el.textContent = text;
  }
  dispatchInputEvents(el, text);
  return true;
}

function strategyDirectAssign(el: HTMLElement, text: string): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.value = text;
  } else {
    el.textContent = text;
  }
  dispatchInputEvents(el, text);
  return true;
}

function verifyWrite(el: HTMLElement, expected: string): boolean {
  return getElementText(el) === expected;
}

/**
 * Write text into an editable element using a strategy chain with verification.
 * On total failure returns success:false (caller should restore original).
 */
export function writeElementText(el: HTMLElement, text: string): WriteBackResult {
  const strategies: Array<{ name: WriteStrategyName; run: () => boolean }> = [
    { name: 'execCommand+events', run: () => strategyExecCommand(el, text) },
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
