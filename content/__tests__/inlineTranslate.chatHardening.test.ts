/**
 * Chat-site hardening tests for inline translate.
 *
 * Covers the defects found in the 2026-09-20 analysis (see
 * .amp/in/artifacts/inline-translate-probe/RESULTS.md):
 * read-path flattening, placeholder text, framework-owned composers,
 * verification false positives, draft destruction, undo identity, focus
 * stealing, cancel-on-type, shadow DOM, language prefixes and timeouts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getElementText,
  initInlineTranslate,
  isCaretAtEnd,
  parseLanguagePrefix,
  setInlineTranslateEnabled,
  writeElementText,
  undoMap,
  removeToast,
  TOAST_CLASS,
} from '@/content/inlineTranslate';
import {
  isFrameworkOwnedEditor,
  verifyWrite,
  writeElementTextAsync,
  isSyntheticInlineEvent,
} from '@/content/inlineTranslate/writeback';
import { runInlineTranslate, tryFallbackUndo, lastWrittenMap } from '@/content/inlineTranslate/orchestrate';
import type { InlineTranslateRuntimeConfig } from '@/content/inlineTranslate/types';

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    sourceLanguage: 'vi',
    targetLanguage: 'en',
    inlineTranslate: { targetLanguage: 'en' },
  }),
}));

const mockSendMessage = vi.fn();

const cfg = (over: Partial<InlineTranslateRuntimeConfig> = {}): InlineTranslateRuntimeConfig => ({
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
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.defineProperty(globalThis, 'chrome', {
    value: {
      runtime: { sendMessage: mockSendMessage },
      storage: { local: { get: vi.fn(), set: vi.fn() }, onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
    },
    writable: true,
    configurable: true,
  });
  mockSendMessage.mockReset();
  document.body.innerHTML = '';
});

afterEach(() => {
  removeToast();
  vi.useRealTimers();
});

/** Chat-composer shaped contentEditable (jsdom needs tabIndex for focus()). */
function composer(html: string): HTMLElement {
  const ce = document.createElement('div');
  ce.contentEditable = 'true';
  ce.tabIndex = 0;
  ce.setAttribute('role', 'textbox');
  ce.innerHTML = html;
  document.body.appendChild(ce);
  ce.focus();
  return ce;
}

function placeCaretInTextNode(node: Node, offset: number): void {
  const sel = window.getSelection();
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/* ── Task 1: reads ─────────────────────────────────────────────── */

describe('chat composer reads', () => {
  it('reads multi-paragraph, <br>, and div-per-line drafts as newline-separated text', () => {
    // facet: multi-paragraph drafts
    const ce = composer('<p>Hello world</p><p>Second paragraph</p>');
    expect(getElementText(ce)).toBe('Hello world\nSecond paragraph');

    // facet: <br> separated drafts
    expect(getElementText(composer('Hello<br>World'))).toBe('Hello\nWorld');

    // facet: div-per-line drafts (WhatsApp/Telegram shape)
    expect(getElementText(composer('<div>Line one</div><div>Line two</div>'))).toBe('Line one\nLine two');
  });

  it('ignores placeholder text and aria-hidden decoration', () => {
    // facet: placeholder text rendered inside the editable
    const ce = composer(
      '<span contenteditable="false" data-slate-placeholder="true">Message #general</span><p><br></p>',
    );
    expect(getElementText(ce)).toBe('');

    // facet: aria-hidden decoration
    expect(getElementText(composer('<p>Real<span aria-hidden="true">hidden</span></p>'))).toBe('Real');
  });

  it('keeps mention text and emoji alt text, and normalizes non-breaking spaces', () => {
    // facet: mention text and emoji alt text
    const ce = composer('<p>Hi <span data-slate-void="true">@alice</span> <img alt="🎉" src="x"></p>');
    expect(getElementText(ce)).toBe('Hi @alice 🎉');

    // facet: non-breaking spaces
    expect(getElementText(composer('<p>Hello\u00a0world</p>'))).toBe('Hello world');
  });

  it('treats a caret at the end of a single- or multi-paragraph draft as at-end', () => {
    // facet: caret at the end of a single paragraph
    const ce = composer('<p>Hello</p>');
    placeCaretInTextNode(ce.querySelector('p')!.firstChild!, 5);
    expect(isCaretAtEnd(ce)).toBe(true);

    // facet: caret at the end of a multi-paragraph draft
    const multi = composer('<p>First</p><p>Second</p>');
    const last = multi.querySelectorAll('p')[1].firstChild!;
    placeCaretInTextNode(last, 6);
    expect(isCaretAtEnd(multi)).toBe(true);
  });

  it('rejects a caret in the middle of a paragraph', () => {
    const ce = composer('<p>Hello world</p>');
    placeCaretInTextNode(ce.querySelector('p')!.firstChild!, 5);
    expect(isCaretAtEnd(ce)).toBe(false);
  });
});

/* ── Task 2: write safety ──────────────────────────────────────── */

describe('write-back safety', () => {
  it('detects framework-owned composers and refuses to write into them (sync and async)', async () => {
    // facet: framework ownership detection
    expect(isFrameworkOwnedEditor(composer('<p>x</p>'))).toBe(false);
    const pm = composer('<p>x</p>');
    pm.classList.add('ProseMirror');
    expect(isFrameworkOwnedEditor(pm)).toBe(true);
    expect(isFrameworkOwnedEditor(composer('<p><span data-lexical-text="true">x</span></p>'))).toBe(true);
    expect(isFrameworkOwnedEditor(composer('<div data-slate-editor="true">x</div>'))).toBe(true);

    // facet: the async write refuses a framework-owned composer
    const asyncCe = composer('<p>Hello</p>');
    asyncCe.classList.add('ProseMirror');
    const res = await writeElementTextAsync(asyncCe, 'Xin chào');
    expect(res.success).toBe(false);
    expect(res.reason).toBe('framework-editor');
    expect(asyncCe.textContent).toBe('Hello');

    // facet: the sync write refuses it too
    const syncCe = composer('<p>Hello</p>');
    syncCe.classList.add('ProseMirror');
    expect(writeElementText(syncCe, 'Xin chào')).toEqual({ success: false, reason: 'framework-editor' });
    expect(syncCe.textContent).toBe('Hello');
  });

  it('does not dispatch input after a prevented beforeinput and stops after a partial change', () => {
    // facet: a prevented beforeinput suppresses the input event
    const ce = composer('<p>Hello</p>');
    ce.addEventListener('beforeinput', (e) => e.preventDefault());
    const inputs: string[] = [];
    ce.addEventListener('input', () => inputs.push('input'));
    const res = writeElementText(ce, 'Xin chào');
    expect(inputs).toEqual([]);
    expect(res.success).toBe(false);

    // facet: a partial change stops the strategy chain instead of stacking
    const partial = composer('<p>Hello</p>');
    partial.addEventListener('beforeinput', (e) => {
      e.preventDefault();
      partial.querySelector('p')!.textContent = 'PARTIAL';
    });
    const partialRes = writeElementText(partial, 'Xin chào');
    expect(partialRes.success).toBe(false);
    expect(partialRes.reason).toBe('partial-change');
    expect(partial.textContent).toBe('PARTIAL');
  });

  it('verifies writes exactly through the block-aware reader', () => {
    // facet: a whitespace-only difference is not a success
    const ce = composer('<p>Hello world   </p>');
    expect(verifyWrite(ce, 'Hello world')).toBe(false);
    expect(verifyWrite(ce, 'Hello world   ')).toBe(true);

    // facet: multi-line content is compared block-aware
    const multi = composer('<p>a</p><p>b</p>');
    expect(verifyWrite(multi, 'a\nb')).toBe(true);
    expect(verifyWrite(multi, 'ab')).toBe(false);
  });

  it('marks the events it dispatches as synthetic', () => {
    const ce = composer('<p>Hello</p>');
    const seen: boolean[] = [];
    ce.addEventListener('input', (e) => seen.push(isSyntheticInlineEvent(e)));
    writeElementText(ce, 'Xin chào');
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(Boolean)).toBe(true);
  });

  it('writes plain contentEditable composers (single and multi-line) and textareas', () => {
    // facet: plain single-line contentEditable
    const ce = composer('<p>Hello</p>');
    const res = writeElementText(ce, 'Xin chào');
    expect(res.success).toBe(true);
    expect(getElementText(ce)).toBe('Xin chào');

    // facet: multi-line contentEditable
    const multi = composer('<p>Hello</p>');
    const multiRes = writeElementText(multi, 'Xin chào\nThế giới');
    expect(multiRes.success).toBe(true);
    expect(getElementText(multi)).toBe('Xin chào\nThế giới');

    // facet: textareas
    const ta = document.createElement('textarea');
    ta.value = 'Hello world';
    document.body.appendChild(ta);
    const taRes = writeElementText(ta, 'Xin chào');
    expect(taRes.success).toBe(true);
    expect(ta.value).toBe('Xin chào');
  });
});

/* ── Task 3: draft integrity ───────────────────────────────────── */

describe('draft integrity', () => {
  it('never rewrites the draft before the translation arrives and leaves it untouched when the composer cannot be written', async () => {
    // facet: the draft stays exactly as typed until the response lands
    const ce = composer('<p>Hello   </p>');
    let release: (v: unknown) => void = () => {};
    mockSendMessage.mockReturnValueOnce(new Promise((r) => { release = r; }));

    const pending = runInlineTranslate(cfg(), { element: ce, skipStripTrailing: false });
    await vi.advanceTimersByTimeAsync(5);
    expect(ce.textContent).toBe('Hello   ');

    release({ success: true, translatedText: 'Xin chào' });
    await pending;
    expect(getElementText(ce)).toBe('Xin chào');

    // facet: an unwritable composer keeps the draft and offers the copy panel
    const locked = composer('<p>Hello   </p>');
    locked.classList.add('ProseMirror');
    mockSendMessage.mockResolvedValueOnce({ success: true, translatedText: 'Xin chào' });

    await runInlineTranslate(cfg(), { element: locked, skipStripTrailing: false });

    expect(locked.textContent).toBe('Hello   ');
    const panel = document.querySelector('.anyllm-inline-copy-panel');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain('Xin chào');
  });

  it('stores the original markup for undo, restores it, and keeps the draft when the translation fails', async () => {
    // facet: original markup is stored and restored via fallback undo
    const ce = composer('<p>Hi <span class="mention">@alice</span></p>');
    mockSendMessage.mockResolvedValueOnce({ success: true, translatedText: 'Chào @alice' });

    await runInlineTranslate(cfg(), { element: ce, skipStripTrailing: true });
    expect(getElementText(ce)).toBe('Chào @alice');
    expect(undoMap.get(ce)?.html).toContain('class="mention"');

    expect(tryFallbackUndo(ce)).toBe(true);
    expect(ce.querySelector('.mention')).not.toBeNull();

    // facet: a failed translation leaves the draft intact and reports the error
    const failed = composer('<p>Hello</p>');
    mockSendMessage.mockResolvedValueOnce({ success: false, error: 'API error' });

    await runInlineTranslate(cfg(), { element: failed, skipStripTrailing: true });

    expect(failed.textContent).toBe('Hello');
    expect(document.querySelector(`.${TOAST_CLASS}`)?.textContent).toContain('Translation failed');
  });
});

/* ── Task 4: undo identity ─────────────────────────────────────── */

describe('undo identity', () => {
  it('does not restore a previous original over a new draft that matches the last translation, and expires stale undo state', async () => {
    // facet: a fresh draft equal to the last translation is translated, not undone
    const ce = composer('<p>Hello</p>');
    mockSendMessage.mockResolvedValueOnce({ success: true, translatedText: 'Xin chào' });
    await runInlineTranslate(cfg(), { element: ce, skipStripTrailing: true });
    expect(getElementText(ce)).toBe('Xin chào');

    // The site sends the message and clears the composer (same DOM node reused).
    ce.innerHTML = '<p><br></p>';
    ce.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    await vi.advanceTimersByTimeAsync(5);

    // User types a new draft that happens to equal the last translation.
    ce.innerHTML = '<p>Xin chào</p>';
    mockSendMessage.mockResolvedValueOnce({ success: true, translatedText: 'Chào nhé' });

    await runInlineTranslate(cfg(), { element: ce, skipStripTrailing: true });

    expect(getElementText(ce)).toBe('Chào nhé');
    expect(mockSendMessage).toHaveBeenCalledTimes(2);

    // facet: undo state older than the expiry window does not undo
    const stale = composer('<p>Hello</p>');
    mockSendMessage.mockResolvedValueOnce({ success: true, translatedText: 'Xin chào' });
    await runInlineTranslate(cfg(), { element: stale, skipStripTrailing: true });

    const entry = lastWrittenMap.get(stale);
    expect(entry).toBeTruthy();
    lastWrittenMap.set(stale, { text: entry!.text, at: Date.now() - 6 * 60 * 1000 });

    mockSendMessage.mockResolvedValueOnce({ success: true, translatedText: 'Chào nhé' });
    await runInlineTranslate(cfg(), { element: stale, skipStripTrailing: true });

    expect(getElementText(stale)).toBe('Chào nhé');
  });
});

/* ── Task 5: focus safety ──────────────────────────────────────── */

describe('focus safety', () => {
  it('does not steal focus back to the composer after the user moved on', async () => {
    const ce = composer('<p>Hello</p>');
    const other = document.createElement('input');
    other.type = 'text';
    document.body.appendChild(other);

    mockSendMessage.mockImplementationOnce(async () => {
      other.focus();
      return { success: true, translatedText: 'Xin chào' };
    });

    await runInlineTranslate(cfg(), { element: ce, skipStripTrailing: true });

    expect(document.activeElement).toBe(other);
    expect(ce.textContent).toBe('Hello');
  });
});

/* ── Task 9: request timeout ───────────────────────────────────── */

describe('request timeout', () => {
  it('clears the translating state when the background never answers', async () => {
    const ce = composer('<p>Hello</p>');
    mockSendMessage.mockReturnValueOnce(new Promise(() => {}));

    const pending = runInlineTranslate(cfg(), { element: ce, skipStripTrailing: true });
    await vi.advanceTimersByTimeAsync(31_000);
    await pending;

    expect(document.querySelector(`.${TOAST_CLASS}`)?.textContent).toContain('Translation failed');
    expect(ce.textContent).toBe('Hello');
  });
});

/* ── Task 6: cancel-on-type during write-back ──────────────────── */

describe('cancel-on-type during write-back', () => {
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = initInlineTranslate();
  });

  afterEach(() => {
    cleanup();
  });

  function fireKeydown(target: Element, key: string): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }

  function focusedInput(value: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    document.body.appendChild(input);
    input.focus();
    return input;
  }

  it('does not cancel itself from its own synthetic write-back events, but cancels when the user really types while a request is in flight', async () => {
    // facet: its own synthetic write-back events must not cancel the flow
    const input = focusedInput('hello   ');
    mockSendMessage.mockResolvedValueOnce({ success: true, translatedText: 'xin chào' });

    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    fireKeydown(input, ' ');
    await vi.advanceTimersByTimeAsync(10);

    expect(input.value).toBe('xin chào');
    expect(document.querySelector(`.${TOAST_CLASS}`)?.textContent).toBe('Translated ✓');

    // facet: a real keystroke while the request is in flight cancels the write-back
    const typed = focusedInput('hello   ');
    let release: (v: unknown) => void = () => {};
    mockSendMessage.mockReturnValueOnce(new Promise((r) => { release = r; }));

    fireKeydown(typed, ' ');
    fireKeydown(typed, ' ');
    fireKeydown(typed, ' ');
    await vi.advanceTimersByTimeAsync(10);

    typed.value = 'hello world!';
    typed.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '!' }));

    release({ success: true, translatedText: 'xin chào' });
    await vi.advanceTimersByTimeAsync(10);

    expect(typed.value).toBe('hello world!');
  });
});

/* ── Task 7: shadow-DOM composers ──────────────────────────────── */

describe('shadow DOM composers', () => {
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = initInlineTranslate();
  });

  afterEach(() => {
    cleanup();
  });

  it('accepts the gesture from a composer inside an open shadow root', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    const ce = document.createElement('div');
    ce.contentEditable = 'true';
    ce.tabIndex = 0;
    ce.setAttribute('role', 'textbox');
    ce.textContent = 'hello   ';
    root.appendChild(ce);
    ce.focus();

    mockSendMessage.mockResolvedValueOnce({ success: true, translatedText: 'xin chào' });

    ce.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, composed: true }));
    ce.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, composed: true }));
    ce.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, composed: true }));
    await vi.advanceTimersByTimeAsync(10);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'translateSelection', text: 'hello' }),
    );
  });
});

/* ── Task 8: language prefixes ─────────────────────────────────── */

describe('language prefixes', () => {
  it('strips only prefixes that name a supported language', () => {
    expect(parseLanguagePrefix('/en hello')).toMatchObject({ targetLang: 'en', body: 'hello' });
    expect(parseLanguagePrefix('/zh-CN hello')).toMatchObject({ targetLang: 'zh-CN', body: 'hello' });
    expect(parseLanguagePrefix('/sv hej').targetLang).toBe('sv');
    // Lookalike words must keep their text (they used to be eaten as a prefix).
    expect(parseLanguagePrefix('/lol that is funny')).toEqual({ body: '/lol that is funny' });
    expect(parseLanguagePrefix('/auto hello')).toEqual({ body: '/auto hello' });
    expect(parseLanguagePrefix('/notalang hi')).toEqual({ body: '/notalang hi' });
  });
});

/* ── Task 10: settings gate ────────────────────────────────────── */

describe('settings gate', () => {
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = initInlineTranslate();
  });

  afterEach(() => {
    cleanup();
    setInlineTranslateEnabled(true);
  });

  it('keeps the gesture inert until stored settings enable the feature', async () => {
    // The content script starts inert so a disabled user setting cannot fire
    // a request during the loadSettings() gap.
    setInlineTranslateEnabled(false);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'hello   ';
    document.body.appendChild(input);
    input.focus();

    for (let i = 0; i < 3; i++) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    }
    await vi.advanceTimersByTimeAsync(10);
    expect(mockSendMessage).not.toHaveBeenCalled();

    setInlineTranslateEnabled(true);
    mockSendMessage.mockResolvedValueOnce({ success: true, translatedText: 'xin chào' });
    for (let i = 0; i < 3; i++) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    }
    await vi.advanceTimersByTimeAsync(10);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });
});