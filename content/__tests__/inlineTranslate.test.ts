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
  it('classifies editable and code-editor controls correctly', () => {
    const input = document.createElement('input');
    input.type = 'text';
    expect(isEditableElement(input)).toBe(true);

    const textarea = document.createElement('textarea');
    expect(isEditableElement(textarea)).toBe(true);

    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    expect(isEditableElement(div)).toBe(true);

    const nonEditable = document.createElement('div');
    expect(isEditableElement(nonEditable)).toBe(false);

    const password = document.createElement('input');
    password.type = 'password';
    expect(isEditableElement(password)).toBe(false);

    expect(isEditableElement(null)).toBe(false);

    // Known code-editor wrappers are excluded from inline translation.
    for (const cls of ['monaco-editor', 'CodeMirror', 'ace_editor', 'cm-editor']) {
      const el = document.createElement('div');
      el.className = cls;
      const child = document.createElement('textarea');
      el.appendChild(child);
      document.body.appendChild(el);
      expect(isCodeEditor(child)).toBe(true);
      el.remove();
    }

    // Monaco-style role=textbox with data-mode-id is still a code editor
    const monaco = document.createElement('div');
    monaco.setAttribute('role', 'textbox');
    monaco.setAttribute('data-mode-id', 'javascript');
    const mChild = document.createElement('textarea');
    monaco.appendChild(mChild);
    document.body.appendChild(monaco);
    expect(isCodeEditor(mChild)).toBe(true);
    monaco.remove();

    const regularInput = document.createElement('input');
    regularInput.type = 'text';
    document.body.appendChild(regularInput);
    expect(isCodeEditor(regularInput)).toBe(false);

    // ChatGPT / Claude / many chat UIs use ProseMirror contenteditable
    const prose = document.createElement('div');
    prose.className = 'ProseMirror';
    prose.contentEditable = 'true';
    prose.setAttribute('role', 'textbox');
    prose.setAttribute('aria-multiline', 'true');
    document.body.appendChild(prose);
    expect(isCodeEditor(prose)).toBe(false);

    // Quill is a general rich-text editor, not a code IDE
    const quill = document.createElement('div');
    quill.className = 'ql-editor';
    quill.contentEditable = 'true';
    document.body.appendChild(quill);
    expect(isCodeEditor(quill)).toBe(false);

    // Generic ARIA multiline textbox (Discord, X/Twitter composers)
    const ariaBox = document.createElement('div');
    ariaBox.setAttribute('role', 'textbox');
    ariaBox.setAttribute('aria-multiline', 'true');
    ariaBox.contentEditable = 'true';
    document.body.appendChild(ariaBox);
    expect(isCodeEditor(ariaBox)).toBe(false);
  });
});

/* ── getElementText ───────────────────────────────────────────── */

describe('getElementText', () => {
  it('reads and replaces text in inputs, textareas, and contentEditable elements', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'original';
    document.body.appendChild(input);
    expect(getElementText(input)).toBe('original');

    const inputHandler = vi.fn();
    const changeHandler = vi.fn();
    input.addEventListener('input', inputHandler);
    input.addEventListener('change', changeHandler);

    replaceElementText(input, 'replaced');

    expect(inputHandler).toHaveBeenCalledTimes(1);
    expect(changeHandler).toHaveBeenCalledTimes(1);

    const textarea = document.createElement('textarea');
    textarea.value = 'original';
    document.body.appendChild(textarea);
    expect(getElementText(textarea)).toBe('original');

    const taInputHandler = vi.fn();
    textarea.addEventListener('input', taInputHandler);

    replaceElementText(textarea, 'replaced');

    expect(taInputHandler).toHaveBeenCalledTimes(1);

    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.textContent = 'editable text';
    expect(getElementText(div)).toBe('editable text');
  });
});

/* ── Configuration ────────────────────────────────────────────── */

describe('configuration', () => {
  it('returns defaults, applies updates, and can disable', () => {
    const config = getInlineTranslateConfig();
    expect(config).toMatchObject({
      enabled: true,
      triggerKey: ' ',
      tapCount: 3,
      timeWindowMs: 500,
    });

    updateInlineTranslateConfig({ tapCount: 4, timeWindowMs: 300 });
    expect(getInlineTranslateConfig()).toMatchObject({ tapCount: 4, timeWindowMs: 300 });

    setInlineTranslateEnabled(false);
    expect(getInlineTranslateConfig().enabled).toBe(false);
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

  it('triple-space within window triggers translation request; keys outside window do not', async () => {
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

    // Keys separated by more than the time window do NOT trigger.
    mockSendMessage.mockClear();
    const slow = createFocusedInput('text   ');
    fireKeydown(slow, ' ');
    await vi.advanceTimersByTimeAsync(300);
    fireKeydown(slow, ' ');
    await vi.advanceTimersByTimeAsync(300);
    fireKeydown(slow, ' ');
    await vi.advanceTimersByTimeAsync(10);
    expect(mockSendMessage).not.toHaveBeenCalled();

    // A custom trigger key/count still routes the cleaned field text.
    updateInlineTranslateConfig({ triggerKey: 'Enter', tapCount: 2 });
    mockSendMessage.mockReset();
    const custom = createFocusedInput('hello');
    mockSendMessage.mockResolvedValueOnce({
      success: true,
      translatedText: 'xin chào',
    });
    fireKeydown(custom, 'Enter');
    fireKeydown(custom, 'Enter');
    await vi.advanceTimersByTimeAsync(10);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'translateSelection',
        text: 'hello',
      }),
    );
  });

  it('ignores non-editable, password, code-editor, empty fields, and when disabled', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    div.focus();
    fireKeydown(div, ' ');
    fireKeydown(div, ' ');
    fireKeydown(div, ' ');
    await vi.advanceTimersByTimeAsync(10);
    expect(mockSendMessage).not.toHaveBeenCalled();

    const password = document.createElement('input');
    password.type = 'password';
    password.value = 'secret   ';
    document.body.appendChild(password);
    password.focus();
    fireKeydown(password, ' ');
    fireKeydown(password, ' ');
    fireKeydown(password, ' ');
    await vi.advanceTimersByTimeAsync(10);
    expect(mockSendMessage).not.toHaveBeenCalled();

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

    const empty = createFocusedInput('   ');
    fireKeydown(empty, ' ');
    fireKeydown(empty, ' ');
    fireKeydown(empty, ' ');
    await vi.advanceTimersByTimeAsync(10);
    expect(mockSendMessage).not.toHaveBeenCalled();

    // Disabled feature → no-op.
    setInlineTranslateEnabled(false);
    const disabledInput = createFocusedInput('text   ');
    fireKeydown(disabledInput, ' ');
    fireKeydown(disabledInput, ' ');
    fireKeydown(disabledInput, ' ');
    await vi.advanceTimersByTimeAsync(10);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('triple-space works in ProseMirror chat composers, including nested-child keydown targets', async () => {
    // Scenario 1: keydowns target the ProseMirror host directly (not treated as code editor)
    const prose = document.createElement('div');
    prose.className = 'ProseMirror';
    prose.contentEditable = 'true';
    prose.setAttribute('role', 'textbox');
    prose.setAttribute('aria-multiline', 'true');
    prose.textContent = 'xin chào   ';
    document.body.appendChild(prose);
    prose.focus();

    mockSendMessage.mockResolvedValueOnce({
      success: true,
      translatedText: 'hello',
    });

    fireKeydown(prose, ' ');
    fireKeydown(prose, ' ');
    fireKeydown(prose, ' ');
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'translateSelection',
        text: 'xin chào',
      }),
    );

    // Scenario 2: real ProseMirror keydowns often target an inner <p>, not the host
    const prose2 = document.createElement('div');
    prose2.className = 'ProseMirror';
    prose2.contentEditable = 'true';
    const p = document.createElement('p');
    p.textContent = 'xin chào   ';
    prose2.appendChild(p);
    document.body.appendChild(prose2);
    prose2.focus();

    mockSendMessage.mockResolvedValueOnce({
      success: true,
      translatedText: 'hello',
    });

    fireKeydown(p, ' ');
    fireKeydown(p, ' ');
    fireKeydown(p, ' ');
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'translateSelection',
        text: 'xin chào',
      }),
    );
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

  it('shows loading toast during translation, updates to success on completion, and auto-dismisses after 2 seconds', async () => {
    const input = createFocusedInput('hello   ');

    let resolveTranslation = (_value: unknown) => {};
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

    resolveTranslation({ success: true, translatedText: 'xin chào' });
    await vi.advanceTimersByTimeAsync(10);

    // Success state
    const successToast = document.querySelector(`.${TOAST_CLASS}`);
    expect(successToast?.getAttribute('data-type')).toBe('success');
    expect(successToast?.textContent).toBe('Translated ✓');

    // Advance 2 seconds for auto-dismiss
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.querySelector(`.${TOAST_CLASS}`)).toBeNull();

    // The same request lifecycle applies the pulsing class while pending.
    mockSendMessage.mockReset();
    const pulseInput = createFocusedInput('hello   ');
    let resolvePulse = (_value: unknown) => {};
    mockSendMessage.mockReturnValueOnce(new Promise((resolve) => {
      resolvePulse = resolve;
    }));
    fireKeydown(pulseInput, ' ');
    fireKeydown(pulseInput, ' ');
    fireKeydown(pulseInput, ' ');
    await vi.advanceTimersByTimeAsync(10);
    expect(pulseInput.classList.contains(PULSING_CLASS)).toBe(true);
    resolvePulse({ success: true, translatedText: 'xin chào' });
    await vi.advanceTimersByTimeAsync(10);
    expect(pulseInput.classList.contains(PULSING_CLASS)).toBe(false);

    // A failed request replaces the loading state with a compact error toast.
    mockSendMessage.mockReset();
    const failedInput = createFocusedInput('hello   ');
    mockSendMessage.mockResolvedValueOnce({
      success: false,
      error: 'API error',
    });

    fireKeydown(failedInput, ' ');
    fireKeydown(failedInput, ' ');
    fireKeydown(failedInput, ' ');
    await vi.advanceTimersByTimeAsync(10);

    const errorToast = document.querySelector(`.${TOAST_CLASS}`);
    expect(errorToast?.getAttribute('data-type')).toBe('error');
    expect(errorToast?.textContent).toBe('⚠ Translation failed');
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

  it('stores original text in undo map and restores it on translation error', async () => {
    // Scenario 1: original text stored in the undo map on success
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

    // Scenario 2: on error, the original text is restored
    const input2 = createFocusedInput('hello   ');
    mockSendMessage.mockRejectedValueOnce(new Error('Network error'));

    fireKeydown(input2, ' ');
    fireKeydown(input2, ' ');
    fireKeydown(input2, ' ');
    await vi.advanceTimersByTimeAsync(10);

    // On error, it should restore the original text
    expect(input2.value).toBe('hello   ');
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

    let resolveFirst = (_value: unknown) => {};
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
    resolveFirst({ success: true, translatedText: 'xin chào' });
    await vi.advanceTimersByTimeAsync(10);

    cleanup();
    const docAddSpy = vi.spyOn(document, 'addEventListener');
    const winAddSpy = vi.spyOn(window, 'addEventListener');
    const docRemoveSpy = vi.spyOn(document, 'removeEventListener');
    const winRemoveSpy = vi.spyOn(window, 'removeEventListener');
    const cleanupListeners = initInlineTranslate();
    expect(docAddSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(winAddSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    cleanupListeners();
    expect(docRemoveSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(winRemoveSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    docAddSpy.mockRestore();
    winAddSpy.mockRestore();
    docRemoveSpy.mockRestore();
    winRemoveSpy.mockRestore();
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

  it('does not count taps on empty or whitespace-only field (prevents swallowed gestures)', async () => {
    for (const value of ['', '     ']) {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = value;
      document.body.appendChild(input);
      input.focus();

      // Fire many more than tapCount — should never trigger because field is empty.
      for (let i = 0; i < 6; i++) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      }
      await vi.advanceTimersByTimeAsync(10);

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(document.querySelector(`.${TOAST_CLASS}`)).toBeNull();
      input.remove();
      removeToast();
    }
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

  it('falls back to document.activeElement when original target is detached or empty', async () => {
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

    mockSendMessage.mockClear();
    const emptyOriginal = document.createElement('input');
    emptyOriginal.type = 'text';
    emptyOriginal.value = 'hello   ';
    document.body.appendChild(emptyOriginal);
    emptyOriginal.focus();

    emptyOriginal.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    emptyOriginal.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    emptyOriginal.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    // Detach original and focus an empty replacement
    emptyOriginal.remove();
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
