/**
 * Immersive-parity unit tests: IME/repeat, race abort, write-back, prefix,
 * blocklist, dual mode, Alt+I entry, editable guards.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isEditableElement,
  getDeepActiveElement,
  isCaretAtEnd,
  writeElementText,
  joinDualMode,
  isUrlBlocked,
  resolveBlocklistPatterns,
  createGestureController,
  parseLanguagePrefix,
  initInlineTranslate,
  updateInlineTranslateConfig,
  translateFocusedInput,
  setInlineTranslateEnabled,
  removeToast,
} from '@/content/inlineTranslate';
import { runInlineTranslate } from '@/content/inlineTranslate/orchestrate';
import { DEFAULT_RUNTIME_CONFIG, type InlineTranslateRuntimeConfig } from '@/content/inlineTranslate/types';

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    sourceLanguage: 'vi',
    targetLanguage: 'en',
    inlineTranslate: { targetLanguage: 'en' },
  }),
}));

const mockSendMessage = vi.fn();

const baseConfig = (): InlineTranslateRuntimeConfig => ({
  ...DEFAULT_RUNTIME_CONFIG,
  enabled: true,
  triggerKey: ' ',
  tapCount: 3,
  targetLanguage: 'en',
  idleMs: 0,
  triggerGapMs: 0,
  triggerToleranceCount: 0,
  minDurationMs: 0,
  confirmLongText: false,
  enableTargetLanguageBar: false,
  inlineGuideShown: true,
  enableLanguagePrefix: true,
  languagePrefix: '/',
  dualMode: false,
  blocklistPatterns: [],
  enableFallbackUndo: true,
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.defineProperty(globalThis, 'chrome', {
    value: {
      runtime: { sendMessage: mockSendMessage },
      storage: {
        local: { get: vi.fn(), set: vi.fn() },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    },
    writable: true,
    configurable: true,
  });
  mockSendMessage.mockReset();
  document.body.innerHTML = '';
  updateInlineTranslateConfig(baseConfig());
});

afterEach(() => {
  removeToast();
  vi.useRealTimers();
});

describe('editable guards', () => {
  it('excludes readOnly/disabled inputs and resolves deep active element', () => {
    const ro = document.createElement('input');
    ro.type = 'text';
    ro.readOnly = true;
    expect(isEditableElement(ro)).toBe(false);

    const dis = document.createElement('input');
    dis.type = 'text';
    dis.disabled = true;
    expect(isEditableElement(dis)).toBe(false);

    const ok = document.createElement('input');
    ok.type = 'text';
    expect(isEditableElement(ok)).toBe(true);

    document.body.appendChild(ok);
    ok.focus();
    expect(getDeepActiveElement(document, true)).toBe(ok);

    // isCaretAtEnd: caret at end of input vs mid-input
    const caret = document.createElement('input');
    caret.type = 'text';
    caret.value = 'abc';
    document.body.appendChild(caret);
    caret.setSelectionRange(3, 3);
    expect(isCaretAtEnd(caret)).toBe(true);
    caret.setSelectionRange(1, 1);
    expect(isCaretAtEnd(caret)).toBe(false);
  });
});

describe('gesture IME / repeat', () => {
  it('handles composing/repeat input, dual input paths, compositionend, idle debounce, and stuck compositionstart recovery', async () => {
    // Scenario 1: event.code=Space when event.key is "Process" (IME remap)
    const triggers: HTMLElement[] = [];
    const input = document.createElement('input');
    input.value = 'hello';
    document.body.appendChild(input);

    const g = createGestureController(
      {
        enabled: true,
        triggerKey: ' ',
        tapCount: 3,
        triggerTimeoutMs: 200,
        idleMs: 0,
        triggerGapMs: 0,
        triggerToleranceCount: 0,
      },
      {
        onTrigger: (el) => triggers.push(el),
        shouldAccept: (el): el is HTMLElement => el instanceof HTMLElement && el === input,
        getText: () => input.value,
      },
    );

    for (let i = 0; i < 3; i++) {
      g.onKeyDown(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true, isComposing: true }),
      );
    }
    expect(triggers).toHaveLength(0);

    for (let i = 0; i < 3; i++) {
      g.onKeyDown(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true, repeat: true }),
      );
    }
    expect(triggers).toHaveLength(0);

    const fire = (key: string, code: string) => {
      const ev = new KeyboardEvent('keydown', { key, code, bubbles: true });
      Object.defineProperty(ev, 'target', { value: input });
      g.onKeyDown(ev);
    };
    // Some IME/OS combos report key differently while code stays Space
    fire('Process', 'Space');
    fire('Process', 'Space');
    fire('Process', 'Space');
    await vi.advanceTimersByTimeAsync(10);
    expect(triggers).toHaveLength(1);

    // Scenario 2: input insertText when keydown is missing (dual path)
    triggers.length = 0;
    const input2 = document.createElement('input');
    input2.value = 'hello';
    document.body.appendChild(input2);

    const g2 = createGestureController(
      {
        enabled: true,
        triggerKey: ' ',
        tapCount: 3,
        triggerTimeoutMs: 200,
        idleMs: 0,
        triggerGapMs: 0,
        triggerToleranceCount: 0,
      },
      {
        onTrigger: (el) => triggers.push(el),
        shouldAccept: (el): el is HTMLElement => el instanceof HTMLElement && el === input2,
        getText: () => input2.value,
      },
    );

    const fireInput = () => {
      const ev = new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: ' ',
      });
      Object.defineProperty(ev, 'target', { value: input2 });
      g2.onInput(ev);
    };
    fireInput();
    fireInput();
    fireInput();
    await vi.advanceTimersByTimeAsync(10);
    expect(triggers).toHaveLength(1);

    // Scenario 3: compositionend arriving after the Nth space does not cancel
    // the pending fire (IME often emits it right after the committing space)
    const triggers2: HTMLElement[] = [];
    const input3 = document.createElement('input');
    input3.value = 'hello';
    document.body.appendChild(input3);

    const g3 = createGestureController(
      {
        enabled: true,
        triggerKey: ' ',
        tapCount: 3,
        triggerTimeoutMs: 200,
        idleMs: 0,
        triggerGapMs: 0,
        triggerToleranceCount: 0,
      },
      {
        onTrigger: (el) => triggers2.push(el),
        shouldAccept: (el): el is HTMLElement => el instanceof HTMLElement && el === input3,
        getText: () => input3.value,
      },
    );

    const fire3 = () => {
      const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
      Object.defineProperty(ev, 'target', { value: input3 });
      g3.onKeyDown(ev);
    };
    fire3();
    fire3();
    fire3();
    g3.onCompositionEnd(new Event('compositionend'));
    await vi.advanceTimersByTimeAsync(10);
    expect(triggers2).toHaveLength(1);

    // Scenario 4: compositionend after the first space must not wipe the tap —
    // exactly 3 spaces still fire (regression: compositionend used to
    // resetTaps(), so Space×3 required 4 presses).
    const triggers3: HTMLElement[] = [];
    const input4 = document.createElement('input');
    input4.value = 'xin chào';
    document.body.appendChild(input4);

    const g4 = createGestureController(
      {
        enabled: true,
        triggerKey: ' ',
        tapCount: 3,
        triggerTimeoutMs: 200,
        idleMs: 0,
        triggerGapMs: 0,
        triggerToleranceCount: 0,
      },
      {
        onTrigger: (el) => triggers3.push(el),
        shouldAccept: (el): el is HTMLElement => el instanceof HTMLElement && el === input4,
        getText: () => input4.value,
      },
    );

    const fire4 = (opts: { isComposing?: boolean } = {}) => {
      const ev = new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        isComposing: opts.isComposing ?? false,
      });
      Object.defineProperty(ev, 'target', { value: input4 });
      g4.onKeyDown(ev);
    };

    fire4(); // tap 1
    g4.onCompositionEnd(new Event('compositionend')); // must NOT wipe tap 1
    fire4(); // tap 2
    fire4(); // tap 3 → fire
    await vi.advanceTimersByTimeAsync(10);
    expect(triggers3).toHaveLength(1);

    // A composing keydown mid-burst must also not wipe prior taps
    triggers3.length = 0;
    fire4();
    fire4({ isComposing: true }); // ignored, no reset
    fire4();
    fire4();
    await vi.advanceTimersByTimeAsync(10);
    expect(triggers3).toHaveLength(1);

    // Idle debounce defers the trigger until the configured quiet period.
    const idleTriggers: HTMLElement[] = [];
    const idleInput = document.createElement('input');
    idleInput.value = 'hello';
    document.body.appendChild(idleInput);
    const idleController = createGestureController(
      {
        enabled: true,
        triggerKey: ' ',
        tapCount: 3,
        triggerTimeoutMs: 200,
        idleMs: 100,
        triggerGapMs: 0,
        triggerToleranceCount: 0,
      },
      {
        onTrigger: (el) => idleTriggers.push(el),
        shouldAccept: (el): el is HTMLElement => el instanceof HTMLElement && el === idleInput,
        getText: () => idleInput.value,
      },
    );
    const fireIdle = () => {
      const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
      Object.defineProperty(ev, 'target', { value: idleInput });
      idleController.onKeyDown(ev);
    };
    fireIdle();
    fireIdle();
    fireIdle();
    expect(idleTriggers).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(50);
    expect(idleTriggers).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60);
    expect(idleTriggers).toHaveLength(1);

    // Scenario 5: keydown + input for the same physical Space does not
    // double-count — exactly 3 physical presses must fire once.
    const triggers4: HTMLElement[] = [];
    const input5 = document.createElement('input');
    input5.value = 'hello';
    document.body.appendChild(input5);

    const g5 = createGestureController(
      {
        enabled: true,
        triggerKey: ' ',
        tapCount: 3,
        triggerTimeoutMs: 200,
        idleMs: 0,
        triggerGapMs: 0,
        triggerToleranceCount: 0,
      },
      {
        onTrigger: (el) => triggers4.push(el),
        shouldAccept: (el): el is HTMLElement => el instanceof HTMLElement && el === input5,
        getText: () => input5.value,
      },
    );

    const press = () => {
      const kd = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
      Object.defineProperty(kd, 'target', { value: input5 });
      g5.onKeyDown(kd);
      const inp = new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: ' ',
      });
      Object.defineProperty(inp, 'target', { value: input5 });
      g5.onInput(inp);
    };

    press();
    press();
    expect(triggers4).toHaveLength(0);
    press();
    await vi.advanceTimersByTimeAsync(10);
    expect(triggers4).toHaveLength(1);

    // Scenario 6: compositionstart stuck without compositionend — next keydown
    // with isComposing:false must recover.
    const triggers5: HTMLElement[] = [];
    const input6 = document.createElement('input');
    input6.value = 'hello';
    document.body.appendChild(input6);

    const g6 = createGestureController(
      {
        enabled: true,
        triggerKey: ' ',
        tapCount: 3,
        triggerTimeoutMs: 200,
        idleMs: 0,
        triggerGapMs: 0,
        triggerToleranceCount: 0,
      },
      {
        onTrigger: (el) => triggers5.push(el),
        shouldAccept: (el): el is HTMLElement => el instanceof HTMLElement && el === input6,
        getText: () => input6.value,
      },
    );

    g6.onCompositionStart(new Event('compositionstart'));
    const fire6 = () => {
      const ev = new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        isComposing: false,
      });
      Object.defineProperty(ev, 'target', { value: input6 });
      g6.onKeyDown(ev);
    };
    fire6();
    fire6();
    fire6();
    await vi.advanceTimersByTimeAsync(10);
    expect(triggers5).toHaveLength(1);
  });
});

describe('write-back, dual mode, blocklist, prefix', () => {
  it('writes text, joins dual mode, blocks known hosts, parses language prefix', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'old';
    document.body.appendChild(input);
    const result = writeElementText(input, 'new text');
    expect(result.success).toBe(true);
    expect(input.value).toBe('new text');

    expect(joinDualMode('a', 'b', input)).toBe('a / b');
    expect(joinDualMode('a', 'b', document.createElement('textarea'))).toBe('a\nb');

    const patterns = resolveBlocklistPatterns(undefined);
    expect(isUrlBlocked('https://www.notion.so/page', patterns)).toBe(true);
    expect(isUrlBlocked('https://www.figma.com/file/xyz', patterns)).toBe(true);
    expect(isUrlBlocked('https://example.com', patterns)).toBe(false);
    // FR-28: label boundary — evilfigma.com must NOT match *figma.com
    expect(isUrlBlocked('https://evilfigma.com/', patterns)).toBe(false);
    expect(isUrlBlocked('evilfigma.com', patterns)).toBe(false);
    expect(isUrlBlocked('figma.com', patterns)).toBe(true);
    expect(isUrlBlocked('www.figma.com', patterns)).toBe(true);

    const r = parseLanguagePrefix('/en hello');
    expect(r.targetLang).toBe('en');
    expect(r.body).toBe('hello');
  });
  it('updates React controlled inputs with valueTracker, replaces contentEditable drafts, and refuses framework-owned composers', () => {
    // facet: React controlled input — valueTracker + onChange listener observe the write
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    // Simulate React value tracker
    let reactState = 'original text';
    textarea.value = reactState;
    let trackedValue = reactState;
    (textarea as unknown as { _valueTracker: { setValue: (v: string) => void; getValue: () => string } })._valueTracker = {
      setValue(v: string) {
        trackedValue = v;
      },
      getValue() {
        return trackedValue;
      },
    };

    textarea.addEventListener('input', (e) => {
      const target = e.target as HTMLTextAreaElement;
      reactState = target.value;
    });

    const writeResult = writeElementText(textarea, 'translated content');
    expect(writeResult.success).toBe(true);
    expect(textarea.value).toBe('translated content');
    // Verify React state updated so sending upon Enter sends translated content
    expect(reactState).toBe('translated content');

    // facet: contentEditable chat composer — replaced without selecting the whole document
    const composer = document.createElement('div');
    composer.contentEditable = 'true';
    composer.tabIndex = 0;
    composer.setAttribute('role', 'textbox');
    const p = document.createElement('p');
    p.textContent = 'original chat message';
    composer.appendChild(p);
    document.body.appendChild(composer);
    composer.focus();

    let capturedMessageOnSend = '';
    composer.addEventListener('input', (e) => {
      const target = e.currentTarget as HTMLElement;
      capturedMessageOnSend = target.textContent ?? '';
    });

    const composerResult = writeElementText(composer, 'translated chat message');
    expect(composerResult.success).toBe(true);
    expect(composer.textContent).toBe('translated chat message');
    expect(capturedMessageOnSend).toBe('translated chat message');

    // facet: framework-owned composer — refuse instead of corrupting the draft
    const slate = document.createElement('div');
    slate.contentEditable = 'true';
    slate.tabIndex = 0;
    slate.setAttribute('role', 'textbox');
    slate.setAttribute('data-slate-editor', 'true');
    const block = document.createElement('div');
    block.textContent = 'original chat message';
    slate.appendChild(block);
    document.body.appendChild(slate);
    slate.focus();

    const previousExecCommand = (document as Document & {
      execCommand?: (command: string, showUi?: boolean, value?: string) => boolean;
    }).execCommand;
    let execCommandCalls = 0;
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: () => {
        execCommandCalls += 1;
        return true;
      },
    });

    try {
      const result = writeElementText(slate, 'translated chat message');

      // Measured: DOM writes into Slate/ProseMirror/Lexical are reverted or
      // duplicated, so the draft must be left exactly as typed.
      expect(result).toEqual({ success: false, reason: 'framework-editor' });
      expect(execCommandCalls).toBe(0);
      expect(slate.textContent).toBe('original chat message');
      expect(document.activeElement).toBe(slate);
    } finally {
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: previousExecCommand,
      });
    }
  });
});

describe('race-safe orchestration', () => {
  it('aborts write when user edits during in-flight request', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'hello world';
    document.body.appendChild(input);
    input.focus();

    let resolveMsg: (v: unknown) => void = () => {};
    mockSendMessage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMsg = resolve;
      }),
    );

    const p = runInlineTranslate(baseConfig(), {
      element: input,
      skipStripTrailing: true,
    });

    // Let the request start
    await vi.advanceTimersByTimeAsync(5);

    // User types while in-flight
    input.value = 'hello world edited';
    // Simulate cancel path via text mismatch when response arrives
    resolveMsg({ success: true, translatedText: 'should not apply' });
    await p;
    await vi.advanceTimersByTimeAsync(10);

    // Must not overwrite with translation
    expect(input.value).toBe('hello world edited');
  });
});

describe('fallback undo', () => {
  it('re-trigger undoes an unedited translation and re-translates after user edits the field', async () => {
    // Scenario 1: unedited re-trigger restores the original (no new request)
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'xin chào';
    document.body.appendChild(input);

    mockSendMessage.mockResolvedValueOnce({
      success: true,
      translatedText: 'hello',
    });

    await runInlineTranslate(baseConfig(), {
      element: input,
      skipStripTrailing: true,
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(input.value).toBe('hello');

    // Unedited re-trigger → restore original
    await runInlineTranslate(baseConfig(), {
      element: input,
      skipStripTrailing: true,
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(input.value).toBe('xin chào');
    expect(mockSendMessage).toHaveBeenCalledTimes(1);

    // Scenario 2: edited field is translated again
    mockSendMessage.mockClear();
    const input2 = document.createElement('input');
    input2.type = 'text';
    input2.value = 'xin chào';
    document.body.appendChild(input2);

    mockSendMessage
      .mockResolvedValueOnce({ success: true, translatedText: 'hello' })
      .mockResolvedValueOnce({ success: true, translatedText: 'new text' });

    await runInlineTranslate(baseConfig(), {
      element: input2,
      skipStripTrailing: true,
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(input2.value).toBe('hello');

    // User edits after translate
    input2.value = 'user typed something new';

    await runInlineTranslate(baseConfig(), {
      element: input2,
      skipStripTrailing: true,
    });
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    expect(mockSendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: 'user typed something new' }),
    );
    expect(input2.value).toBe('new text');
  });
});

describe('translateFocusedInput (Alt+I path)', () => {
  it('translates the focused input without trailing spaces and no-ops when disabled', async () => {
    const cleanup = initInlineTranslate();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'xin chào';
    document.body.appendChild(input);
    input.focus();

    mockSendMessage.mockResolvedValueOnce({
      success: true,
      translatedText: 'hello',
    });

    await translateFocusedInput();
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'translateSelection',
        text: 'xin chào',
      }),
    );
    expect(input.value).toBe('hello');
    cleanup();

    // Disabled → no-op
    mockSendMessage.mockClear();
    setInlineTranslateEnabled(false);
    const input2 = document.createElement('input');
    input2.value = 'hello';
    document.body.appendChild(input2);
    input2.focus();
    await translateFocusedInput();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

describe('prefix + gesture pipeline', () => {
  it('strips /en and sends English target', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = '/en hello world';
    document.body.appendChild(input);

    mockSendMessage.mockResolvedValueOnce({
      success: true,
      translatedText: 'hola',
    });

    await runInlineTranslate(baseConfig(), {
      element: input,
      skipStripTrailing: true,
    });
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'hello world',
        targetLanguage: 'en',
      }),
    );
  });
});


describe('two-branch gesture FSM (refer truth table)', () => {
  type Over = Partial<Parameters<typeof createGestureController>[0]>;

  function setup(over: Over = {}, gate: (el: HTMLElement) => boolean = () => true) {
    const triggers: HTMLElement[] = [];
    const input = document.createElement('input');
    input.value = 'hello';
    document.body.appendChild(input);
    const g = createGestureController(
      {
        enabled: true,
        triggerKey: ' ',
        tapCount: 3,
        idleMs: 250,
        triggerGapMs: 250,
        triggerToleranceCount: 2,
        triggerTimeoutMs: 200,
        ...over,
      },
      {
        onTrigger: (el) => triggers.push(el),
        shouldAccept: (el): el is HTMLElement => el === input,
        getText: () => input.value,
        passesTailGate: gate,
        now: () => Date.now(),
      },
    );
    const key = (k: string, code = '') => {
      const ev = new KeyboardEvent('keydown', { key: k, code, bubbles: true });
      Object.defineProperty(ev, 'target', { value: input });
      g.onKeyDown(ev);
    };
    const insert = (data: string | null, inputType = 'insertText') => {
      const ev = new InputEvent('input', { bubbles: true, inputType, data });
      Object.defineProperty(ev, 'target', { value: input });
      g.onInput(ev);
    };
    /** Tap `n` times with `gap` ms between taps (fake clock). */
    const taps = async (n: number, gap: number, k = ' ') => {
      for (let i = 0; i < n; i++) {
        if (i > 0) await vi.advanceTimersByTimeAsync(gap);
        key(k, k === ' ' ? 'Space' : '');
      }
    };
    return { g, triggers, key, insert, taps };
  }

  beforeEach(() => {
    vi.useRealTimers();
    vi.useFakeTimers();
  });

  it('Space: 200 ms gaps ×3 fire after the idle window; 400 ms gaps never do', async () => {
    const fast = setup();
    await fast.taps(3, 200);
    await vi.advanceTimersByTimeAsync(249);
    expect(fast.triggers).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(fast.triggers).toHaveLength(1);

    const slow = setup();
    await slow.taps(3, 400);
    await vi.advanceTimersByTimeAsync(1000);
    expect(slow.triggers).toHaveLength(0);
  });

  it('Space: 3–5 taps fire once (tolerance 2); 6 fast taps never fire', async () => {
    for (const n of [3, 4, 5]) {
      const s = setup();
      await s.taps(n, 100);
      await vi.advanceTimersByTimeAsync(300);
      expect(s.triggers, `${n} taps`).toHaveLength(1);
    }
    const six = setup();
    await six.taps(6, 100);
    await vi.advanceTimersByTimeAsync(300);
    expect(six.triggers).toHaveLength(0);
  });

  it('Space: NBSP and U+3000 count as taps', async () => {
    const s = setup();
    s.insert(' ');
    await vi.advanceTimersByTimeAsync(150);
    s.key('　');
    await vi.advanceTimersByTimeAsync(150);
    s.insert(' ');
    await vi.advanceTimersByTimeAsync(300);
    expect(s.triggers).toHaveLength(1);
  });

  it('a letter after the taps, a failed tail gate, compositionstart or a delete resets the burst', async () => {
    const letter = setup();
    await letter.taps(3, 100);
    letter.key('a', 'KeyA');
    await vi.advanceTimersByTimeAsync(300);
    expect(letter.triggers).toHaveLength(0);

    const gated = setup({}, () => false);
    await gated.taps(3, 100);
    await vi.advanceTimersByTimeAsync(300);
    expect(gated.triggers).toHaveLength(0);
    expect(gated.g.getCount()).toBe(0);

    const ime = setup();
    await ime.taps(2, 100);
    ime.g.onCompositionStart(new Event('compositionstart'));
    ime.g.onCompositionEnd(new Event('compositionend'));
    ime.key(' ', 'Space');
    await vi.advanceTimersByTimeAsync(300);
    expect(ime.triggers).toHaveLength(0);

    const del = setup();
    await del.taps(2, 100);
    del.insert(null, 'deleteContentBackward');
    del.key(' ', 'Space');
    await vi.advanceTimersByTimeAsync(300);
    expect(del.triggers).toHaveLength(0);
  });

  it('non-space: `/`×3 within the combo interval fires immediately; a longer gap restarts the count', async () => {
    const s = setup({ triggerKey: '/' });
    await s.taps(3, 150, '/');
    await vi.advanceTimersByTimeAsync(0);
    expect(s.triggers).toHaveLength(1);

    const slow = setup({ triggerKey: '/' });
    await slow.taps(3, 250, '/');
    await vi.advanceTimersByTimeAsync(500);
    expect(slow.triggers).toHaveLength(0);

    // Full-width alias and modifier presses between taps (Shift for `:`).
    const wide = setup({ triggerKey: ':' });
    wide.key('Shift');
    wide.key(':');
    await vi.advanceTimersByTimeAsync(120);
    wide.key('Shift');
    // An IME that swallows keydown: only the full-width insertText arrives.
    wide.insert('：');
    await vi.advanceTimersByTimeAsync(60);
    wide.key(':');
    await vi.advanceTimersByTimeAsync(0);
    expect(wide.triggers).toHaveLength(1);
  });

  it('keydown + insertText for one physical press still count once', async () => {
    const s = setup();
    for (let i = 0; i < 3; i++) {
      s.key(' ', 'Space');
      s.insert(' ');
    }
    expect(s.g.getCount()).toBe(3);
    await vi.advanceTimersByTimeAsync(300);
    expect(s.triggers).toHaveLength(1);
  });
});

describe('language precedence + same-language notice', () => {
  const JA = 'これは日本語のメッセージです。よろしくお願いします。';

  function field(value: string): HTMLTextAreaElement {
    document.body.insertAdjacentHTML('beforeend', `<div class="thread"><p class="msg">${JA}</p></div>`);
    const ta = document.createElement('textarea');
    ta.value = value;
    document.querySelector('.thread')!.appendChild(ta);
    return ta;
  }

  async function run(el: HTMLElement, over: Partial<InlineTranslateRuntimeConfig> = {}) {
    await runInlineTranslate({ ...baseConfig(), ...over }, { element: el, skipStripTrailing: true });
    await vi.advanceTimersByTimeAsync(10);
    return mockSendMessage.mock.calls.at(-1)?.[0] as { text: string; targetLanguage: string };
  }

  afterEach(() => {
    document.documentElement.removeAttribute('lang');
  });

  it('explicit prefix beats selectors, selectors beat page, page beats default', async () => {
    document.documentElement.lang = 'de';
    mockSendMessage.mockResolvedValue({ success: true, translatedText: 'out' });
    const selectors = { autoLanguageSelectors: ['parentElementTo .thread .msg'] };

    expect(await run(field('/ko xin chào'), { ...selectors, autoLanguagePageEnable: true })).toMatchObject(
      { text: 'xin chào', targetLanguage: 'ko' },
    );
    document.body.innerHTML = '';
    expect((await run(field('xin chào'), { ...selectors, autoLanguagePageEnable: true })).targetLanguage).toBe(
      'ja',
    );
    document.body.innerHTML = '';
    expect((await run(field('xin chào'), { autoLanguagePageEnable: true })).targetLanguage).toBe('de');
    document.body.innerHTML = '';
    expect((await run(field('xin chào'), { ...selectors, autoLanguageEnable: false })).targetLanguage).toBe(
      'en',
    );
  });

  it('writes the translation without the prefix token', async () => {
    mockSendMessage.mockResolvedValue({ success: true, translatedText: 'hello' });
    const ta = field('//en xin chào');
    await run(ta);
    expect(ta.value).toBe('hello');
  });

  it('same language and unchanged result → notice, field untouched', async () => {
    const draft = 'Hello there, this is the message that you wanted to read';
    mockSendMessage.mockResolvedValue({ success: true, translatedText: `${draft} ` });
    const ta = field(draft);
    await run(ta);
    expect(ta.value).toBe(draft);
    expect(ta.getAttribute('data-anyllm-inline-translated')).toBeNull();
    expect(document.body.textContent).toContain('Already in English');
  });

  it('changed result in the same language is still written', async () => {
    const draft = 'Hello there, this is the message that you wanted to read';
    mockSendMessage.mockResolvedValue({ success: true, translatedText: 'Hi, here is the message you wanted' });
    const ta = field(draft);
    await run(ta);
    expect(ta.value).toBe('Hi, here is the message you wanted');
  });
});
