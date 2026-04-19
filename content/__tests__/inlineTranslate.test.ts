/**
 * Unit tests for content/inlineTranslate.ts
 * Covers: gesture detection, guards, text replacement, visual feedback, settings wiring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isEditableElement,
  isCodeEditor,
  getElementText,
  replaceElementText,
  initInlineTranslate,
  setInlineTranslateEnabled,
  updateInlineTranslateConfig,
  getInlineTranslateConfig,
  isInlineTranslating,
  undoMap,
  PULSING_CLASS,
  TOAST_CLASS,
  removeToast,
} from '@/content/inlineTranslate';

/* ── Mocks ────────────────────────────────────────────────────── */

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    sourceLanguage: 'vi',
    targetLanguage: 'en',
    inlineTranslate: {
      targetLanguage: 'en',
    },
  }),
}));

const mockSendMessage = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });

  // Reset chrome.runtime mock
  Object.defineProperty(globalThis, 'chrome', {
    value: {
      runtime: { sendMessage: mockSendMessage },
      storage: { local: { get: vi.fn(), set: vi.fn() }, onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
    },
    writable: true,
    configurable: true,
  });

  // Reset to defaults
  updateInlineTranslateConfig({
    enabled: true,
    triggerKey: ' ',
    tapCount: 3,
    timeWindowMs: 500,
  });

  mockSendMessage.mockReset();
  document.body.innerHTML = '';
});

afterEach(() => {
  removeToast();
  vi.useRealTimers();
});

/* ── isEditableElement ────────────────────────────────────────── */

describe('isEditableElement', () => {
  it('returns true for input[type="text"]', () => {
    const input = document.createElement('input');
    input.type = 'text';
    expect(isEditableElement(input)).toBe(true);
  });

  it('returns true for input[type="search"]', () => {
    const input = document.createElement('input');
    input.type = 'search';
    expect(isEditableElement(input)).toBe(true);
  });

  it('returns true for textarea', () => {
    const textarea = document.createElement('textarea');
    expect(isEditableElement(textarea)).toBe(true);
  });

  it('returns true for contentEditable elements', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    expect(isEditableElement(div)).toBe(true);
  });

  it('returns false for input[type="password"]', () => {
    const input = document.createElement('input');
    input.type = 'password';
    expect(isEditableElement(input)).toBe(false);
  });

  it('returns false for non-editable div', () => {
    const div = document.createElement('div');
    expect(isEditableElement(div)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isEditableElement(null)).toBe(false);
  });
});

/* ── isCodeEditor ─────────────────────────────────────────────── */

describe('isCodeEditor', () => {
  it('detects Monaco editor by class', () => {
    const el = document.createElement('div');
    el.className = 'monaco-editor';
    const child = document.createElement('textarea');
    el.appendChild(child);
    document.body.appendChild(el);
    expect(isCodeEditor(child)).toBe(true);
  });

  it('detects CodeMirror by class', () => {
    const el = document.createElement('div');
    el.className = 'CodeMirror';
    const child = document.createElement('textarea');
    el.appendChild(child);
    document.body.appendChild(el);
    expect(isCodeEditor(child)).toBe(true);
  });

  it('detects Ace editor by class', () => {
    const el = document.createElement('div');
    el.className = 'ace_editor';
    const child = document.createElement('textarea');
    el.appendChild(child);
    document.body.appendChild(el);
    expect(isCodeEditor(child)).toBe(true);
  });

  it('detects cm-editor by class', () => {
    const el = document.createElement('div');
    el.className = 'cm-editor';
    const child = document.createElement('textarea');
    el.appendChild(child);
    document.body.appendChild(el);
    expect(isCodeEditor(child)).toBe(true);
  });

  it('returns false for regular input', () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    expect(isCodeEditor(input)).toBe(false);
  });
});

/* ── getElementText ───────────────────────────────────────────── */

describe('getElementText', () => {
  it('gets value from input', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'hello world';
    expect(getElementText(input)).toBe('hello world');
  });

  it('gets value from textarea', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'some text';
    expect(getElementText(textarea)).toBe('some text');
  });

  it('gets textContent from contentEditable', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.textContent = 'editable text';
    expect(getElementText(div)).toBe('editable text');
  });
});

/* ── replaceElementText ───────────────────────────────────────── */

describe('replaceElementText', () => {
  it('dispatches input and change events on input', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'original';
    document.body.appendChild(input);

    const inputHandler = vi.fn();
    const changeHandler = vi.fn();
    input.addEventListener('input', inputHandler);
    input.addEventListener('change', changeHandler);

    replaceElementText(input, 'replaced');

    expect(inputHandler).toHaveBeenCalledTimes(1);
    expect(changeHandler).toHaveBeenCalledTimes(1);
  });

  it('dispatches input and change events on textarea', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'original';
    document.body.appendChild(textarea);

    const inputHandler = vi.fn();
    textarea.addEventListener('input', inputHandler);

    replaceElementText(textarea, 'replaced');

    expect(inputHandler).toHaveBeenCalledTimes(1);
  });
});

/* ── Configuration ────────────────────────────────────────────── */

describe('configuration', () => {
  it('returns default configuration', () => {
    const config = getInlineTranslateConfig();
    expect(config.enabled).toBe(true);
    expect(config.triggerKey).toBe(' ');
    expect(config.tapCount).toBe(3);
    expect(config.timeWindowMs).toBe(500);
  });

  it('updates config via updateInlineTranslateConfig', () => {
    updateInlineTranslateConfig({ tapCount: 4, timeWindowMs: 300 });
    const config = getInlineTranslateConfig();
    expect(config.tapCount).toBe(4);
    expect(config.timeWindowMs).toBe(300);
  });

  it('disables via setInlineTranslateEnabled', () => {
    setInlineTranslateEnabled(false);
    const config = getInlineTranslateConfig();
    expect(config.enabled).toBe(false);
  });
});

/* ── Gesture Detection (Keyboard Events) ──────────────────────── */

describe('gesture detection', () => {
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = initInlineTranslate();
  });

  afterEach(() => {
    cleanup();
  });

  function createFocusedInput(value: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    document.body.appendChild(input);
    input.focus();
    return input;
  }

  function fireKeydown(target: Element, key: string) {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true }),
    );
  }

  it('triple-space within window triggers translation request', async () => {
    const input = createFocusedInput('xin chào   ');
    mockSendMessage.mockResolvedValueOnce({
      success: true,
      translatedText: 'hello',
    });

    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    fireKeydown(input, ' ');

    // The gesture triggers via setTimeout(0)
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'translateSelection',
        text: 'xin chào',
      }),
    );
  });

  it('does NOT trigger when keys exceed time window', async () => {
    const input = createFocusedInput('text   ');

    fireKeydown(input, ' ');
    await vi.advanceTimersByTimeAsync(300);
    fireKeydown(input, ' ');
    await vi.advanceTimersByTimeAsync(300);
    fireKeydown(input, ' ');
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('ignores non-editable elements', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    div.focus();

    fireKeydown(div, ' ');
    fireKeydown(div, ' ');
    fireKeydown(div, ' ');
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('ignores password fields', async () => {
    const input = document.createElement('input');
    input.type = 'password';
    input.value = 'secret   ';
    document.body.appendChild(input);
    input.focus();

    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('ignores code editor elements', async () => {
    const editor = document.createElement('div');
    editor.className = 'monaco-editor';
    const textarea = document.createElement('textarea');
    textarea.value = 'const x = 1   ';
    editor.appendChild(textarea);
    document.body.appendChild(editor);
    textarea.focus();

    fireKeydown(textarea, ' ');
    fireKeydown(textarea, ' ');
    fireKeydown(textarea, ' ');
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('skips empty/whitespace inputs', async () => {
    const input = createFocusedInput('   ');

    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('respects configurable key and count', async () => {
    updateInlineTranslateConfig({ triggerKey: 'Enter', tapCount: 2 });

    const input = createFocusedInput('hello');
    mockSendMessage.mockResolvedValueOnce({
      success: true,
      translatedText: 'xin chào',
    });

    fireKeydown(input, 'Enter');
    fireKeydown(input, 'Enter');
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'translateSelection',
        text: 'hello',
      }),
    );
  });

  it('does not trigger when disabled', async () => {
    setInlineTranslateEnabled(false);
    const input = createFocusedInput('text   ');

    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

/* ── Visual Feedback ──────────────────────────────────────────── */

describe('visual feedback', () => {
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = initInlineTranslate();
  });

  afterEach(() => {
    cleanup();
  });

  function createFocusedInput(value: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    document.body.appendChild(input);
    input.focus();
    return input;
  }

  function fireKeydown(target: Element, key: string) {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true }),
    );
  }

  it('adds pulsing class during translation, removes after', async () => {
    const input = createFocusedInput('hello   ');

    let resolveTranslation: (value: unknown) => void;
    const translationPromise = new Promise((resolve) => {
      resolveTranslation = resolve;
    });
    mockSendMessage.mockReturnValueOnce(translationPromise);

    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    await vi.advanceTimersByTimeAsync(10);

    // Pulsing should be active
    expect(input.classList.contains(PULSING_CLASS)).toBe(true);

    // Resolve the translation
    resolveTranslation!({ success: true, translatedText: 'xin chào' });
    await vi.advanceTimersByTimeAsync(10);

    // Pulsing should be removed
    expect(input.classList.contains(PULSING_CLASS)).toBe(false);
  });

  it('shows toast with loading state', async () => {
    const input = createFocusedInput('hello   ');

    let resolveTranslation: (value: unknown) => void;
    const translationPromise = new Promise((resolve) => {
      resolveTranslation = resolve;
    });
    mockSendMessage.mockReturnValueOnce(translationPromise);

    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    await vi.advanceTimersByTimeAsync(10);

    // Toast should be visible with loading type
    const toast = document.querySelector(`.${TOAST_CLASS}`);
    expect(toast).not.toBeNull();
    expect(toast?.getAttribute('data-type')).toBe('loading');
    expect(toast?.textContent).toBe('Translating...');

    resolveTranslation!({ success: true, translatedText: 'xin chào' });
    await vi.advanceTimersByTimeAsync(10);
  });

  it('updates toast to success on completion', async () => {
    const input = createFocusedInput('hello   ');
    mockSendMessage.mockResolvedValueOnce({
      success: true,
      translatedText: 'xin chào',
    });

    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    await vi.advanceTimersByTimeAsync(10);

    const toast = document.querySelector(`.${TOAST_CLASS}`);
    expect(toast?.getAttribute('data-type')).toBe('success');
    expect(toast?.textContent).toBe('Translated ✓');
  });

  it('shows error toast on failure', async () => {
    const input = createFocusedInput('hello   ');
    mockSendMessage.mockResolvedValueOnce({
      success: false,
      error: 'API error',
    });

    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    await vi.advanceTimersByTimeAsync(10);

    const toast = document.querySelector(`.${TOAST_CLASS}`);
    expect(toast?.getAttribute('data-type')).toBe('error');
    expect(toast?.textContent).toBe('⚠ Translation failed');
  });

  it('auto-dismisses toast after 2 seconds', async () => {
    const input = createFocusedInput('hello   ');
    mockSendMessage.mockResolvedValueOnce({
      success: true,
      translatedText: 'xin chào',
    });

    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    await vi.advanceTimersByTimeAsync(10);

    expect(document.querySelector(`.${TOAST_CLASS}`)).not.toBeNull();

    // Advance 2 seconds for auto-dismiss
    await vi.advanceTimersByTimeAsync(2000);

    expect(document.querySelector(`.${TOAST_CLASS}`)).toBeNull();
  });
});

/* ── Error Recovery ───────────────────────────────────────────── */

describe('error recovery', () => {
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = initInlineTranslate();
  });

  afterEach(() => {
    cleanup();
  });

  function createFocusedInput(value: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    document.body.appendChild(input);
    input.focus();
    return input;
  }

  function fireKeydown(target: Element, key: string) {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true }),
    );
  }

  it('stores original text in undo map', async () => {
    const input = createFocusedInput('hello   ');
    mockSendMessage.mockResolvedValueOnce({
      success: true,
      translatedText: 'xin chào',
    });

    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    await vi.advanceTimersByTimeAsync(10);

    expect(undoMap.has(input)).toBe(true);
    expect(undoMap.get(input)).toBe('hello   ');
  });

  it('restores original text on translation error', async () => {
    const input = createFocusedInput('hello   ');
    mockSendMessage.mockRejectedValueOnce(new Error('Network error'));

    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    await vi.advanceTimersByTimeAsync(10);

    // On error, it should restore the original text
    expect(input.value).toBe('hello   ');
  });
});

/* ── Debounce ─────────────────────────────────────────────────── */

describe('debounce', () => {
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = initInlineTranslate();
  });

  afterEach(() => {
    cleanup();
  });

  it('prevents re-trigger during active translation', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'hello   ';
    document.body.appendChild(input);
    input.focus();

    let resolveFirst: (value: unknown) => void;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    mockSendMessage.mockReturnValueOnce(firstPromise);

    const fireKeydown = (key: string) => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    };

    // First trigger
    fireKeydown(' ');
    fireKeydown(' ');
    fireKeydown(' ');
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);

    // Try to trigger again while first is in progress
    input.value = 'world   ';
    fireKeydown(' ');
    fireKeydown(' ');
    fireKeydown(' ');
    await vi.advanceTimersByTimeAsync(10);

    // Should still only be 1 call
    expect(mockSendMessage).toHaveBeenCalledTimes(1);

    // Resolve first
    resolveFirst!({ success: true, translatedText: 'xin chào' });
    await vi.advanceTimersByTimeAsync(10);
  });
});

/* ── Cleanup ──────────────────────────────────────────────────── */

describe('cleanup', () => {
  it('removes event listeners on cleanup', () => {
    const docRemoveSpy = vi.spyOn(document, 'removeEventListener');
    const winRemoveSpy = vi.spyOn(window, 'removeEventListener');
    const cleanup = initInlineTranslate();
    cleanup();
    expect(docRemoveSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(winRemoveSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    docRemoveSpy.mockRestore();
    winRemoveSpy.mockRestore();
  });

  it('registers keydown listeners on both window and document (capture)', () => {
    const docAddSpy = vi.spyOn(document, 'addEventListener');
    const winAddSpy = vi.spyOn(window, 'addEventListener');
    const cleanup = initInlineTranslate();
    expect(docAddSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(winAddSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    cleanup();
    docAddSpy.mockRestore();
    winAddSpy.mockRestore();
  });
});

/* ── Dedup (Window + Document) ────────────────────────────────── */

describe('event dedup', () => {
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = initInlineTranslate();
  });

  afterEach(() => {
    cleanup();
  });

  it('processes each keydown event exactly once across window + document listeners', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'hello   ';
    document.body.appendChild(input);
    input.focus();

    mockSendMessage.mockResolvedValueOnce({
      success: true,
      translatedText: 'xin chào',
    });

    // Dispatch three keydown events — each propagates through window AND
    // document capture phase. Without dedup, tapCount would be reached
    // after ~2 events (6 counts), producing multiple translation calls.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });
});

/* ── Empty-field Guard & Re-acquisition ───────────────────────── */

describe('empty field guard', () => {
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = initInlineTranslate();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not count taps on empty field (prevents swallowed gestures)', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = '';
    document.body.appendChild(input);
    input.focus();

    // Fire many more than tapCount — should never trigger because field is empty.
    for (let i = 0; i < 6; i++) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    }
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(document.querySelector(`.${TOAST_CLASS}`)).toBeNull();
  });

  it('does not count taps when field has only whitespace', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = '     ';
    document.body.appendChild(input);
    input.focus();

    for (let i = 0; i < 6; i++) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    }
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

describe('active-element re-acquisition', () => {
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = initInlineTranslate();
  });

  afterEach(() => {
    cleanup();
  });

  it('falls back to document.activeElement when original target is detached', async () => {
    const original = document.createElement('input');
    original.type = 'text';
    original.value = 'hello   ';
    document.body.appendChild(original);
    original.focus();

    // Fire the gesture to completion, but before the microtask runs,
    // swap the original element out and focus a replacement.
    mockSendMessage.mockResolvedValueOnce({
      success: true,
      translatedText: 'xin chào',
    });

    original.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    original.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    original.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    // Simulate Google-style DOM swap: remove the original, add a fresh one.
    original.remove();
    const replacement = document.createElement('input');
    replacement.type = 'text';
    replacement.value = 'hello   ';
    document.body.appendChild(replacement);
    replacement.focus();

    await vi.advanceTimersByTimeAsync(10);

    // Translation should still happen — operating on the re-acquired element.
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'translateSelection',
        text: 'hello',
      }),
    );
  });

  it('shows "Type something first" toast when gesture fires but active element is empty', async () => {
    const original = document.createElement('input');
    original.type = 'text';
    original.value = 'hello   ';
    document.body.appendChild(original);
    original.focus();

    original.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    original.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    original.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    // Detach original and focus an empty replacement
    original.remove();
    const empty = document.createElement('input');
    empty.type = 'text';
    empty.value = '';
    document.body.appendChild(empty);
    empty.focus();

    await vi.advanceTimersByTimeAsync(10);

    const toast = document.querySelector(`.${TOAST_CLASS}`);
    expect(toast).not.toBeNull();
    expect(toast?.getAttribute('data-type')).toBe('error');
    expect(toast?.textContent).toBe('⚠ Type something first');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
