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
  undoMap,
  tryFallbackUndo,
  removeToast,
} from '@/content/inlineTranslate';
import { runInlineTranslate } from '@/content/inlineTranslate/orchestrate';
import type { InlineTranslateRuntimeConfig } from '@/content/inlineTranslate/types';

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    sourceLanguage: 'vi',
    targetLanguage: 'en',
    inlineTranslate: { targetLanguage: 'en' },
  }),
}));

const mockSendMessage = vi.fn();

const baseConfig = (): InlineTranslateRuntimeConfig => ({
  enabled: true,
  triggerKey: ' ',
  tapCount: 3,
  timeWindowMs: 500,
  targetLanguage: 'en',
  idleMs: 0,
  triggerGapMs: 0,
  triggerToleranceCount: 0,
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
  });
});

describe('gesture IME / repeat', () => {
  it('ignores isComposing and repeat keydowns', () => {
    const triggers: HTMLElement[] = [];
    const input = document.createElement('input');
    input.value = 'hello';
    document.body.appendChild(input);

    const g = createGestureController(
      {
        enabled: true,
        triggerKey: ' ',
        tapCount: 3,
        timeWindowMs: 500,
        idleMs: 0,
        triggerGapMs: 0,
        triggerToleranceCount: 0,
      },
      {
        onTrigger: (el) => triggers.push(el),
        shouldAccept: (el): el is HTMLElement => el instanceof HTMLElement,
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

    g.onKeyDown(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    g.onKeyDown(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    g.onKeyDown(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    // fire via setTimeout(0)
  });

  it('fires after idle debounce when idleMs > 0', async () => {
    const triggers: HTMLElement[] = [];
    const input = document.createElement('input');
    input.value = 'hello';
    document.body.appendChild(input);

    const g = createGestureController(
      {
        enabled: true,
        triggerKey: ' ',
        tapCount: 3,
        timeWindowMs: 500,
        idleMs: 100,
        triggerGapMs: 0,
        triggerToleranceCount: 0,
      },
      {
        onTrigger: (el) => triggers.push(el),
        shouldAccept: (el): el is HTMLElement =>
          el instanceof HTMLElement && el === input,
        getText: () => input.value,
      },
    );

    // Dispatch with target so shouldAccept sees input
    const fire = () => {
      const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
      Object.defineProperty(ev, 'target', { value: input });
      g.onKeyDown(ev);
    };
    fire();
    fire();
    fire();
    expect(triggers).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(50);
    expect(triggers).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60);
    expect(triggers).toHaveLength(1);
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

    const r = parseLanguagePrefix('/en hello');
    expect(r.targetLang).toBe('en');
    expect(r.body).toBe('hello');
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
  it('restores original from undoMap', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'translated';
    document.body.appendChild(input);
    undoMap.set(input, 'original text');
    expect(tryFallbackUndo(input)).toBe(true);
    expect(input.value).toBe('original text');
  });

  it('re-trigger undoes only when field is still the last translation', async () => {
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
  });

  it('re-trigger translates again after user edits the field', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'xin chào';
    document.body.appendChild(input);

    mockSendMessage
      .mockResolvedValueOnce({ success: true, translatedText: 'hello' })
      .mockResolvedValueOnce({ success: true, translatedText: 'new text' });

    await runInlineTranslate(baseConfig(), {
      element: input,
      skipStripTrailing: true,
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(input.value).toBe('hello');

    // User edits after translate
    input.value = 'user typed something new';

    await runInlineTranslate(baseConfig(), {
      element: input,
      skipStripTrailing: true,
    });
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    expect(mockSendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: 'user typed something new' }),
    );
    expect(input.value).toBe('new text');
  });
});

describe('translateFocusedInput (Alt+I path)', () => {
  it('translates focused input without requiring trailing spaces', async () => {
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
  });

  it('no-ops when disabled', async () => {
    setInlineTranslateEnabled(false);
    const input = document.createElement('input');
    input.value = 'hello';
    document.body.appendChild(input);
    input.focus();
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

describe('isCaretAtEnd', () => {
  it('detects caret at end of input', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'abc';
    document.body.appendChild(input);
    input.setSelectionRange(3, 3);
    expect(isCaretAtEnd(input)).toBe(true);
    input.setSelectionRange(1, 1);
    expect(isCaretAtEnd(input)).toBe(false);
  });
});
