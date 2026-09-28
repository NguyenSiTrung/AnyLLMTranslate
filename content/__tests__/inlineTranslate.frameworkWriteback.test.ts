/**
 * Framework-editor write-back via editor-native APIs + redesigned copy panel.
 *
 * Framework-owned composers (Quill/ProseMirror/Lexical/Slate) revert or corrupt
 * on DOM-level writes, so the pipeline refuses them. Quill however exposes its
 * editor instance on the container DOM node (`__quill` — the same mechanism
 * Quill.find uses), letting us write through the editor's own model safely.
 * When no API exists, the copy panel must make the manual paste path trivial:
 * copy + focus + select the draft so a real Ctrl+V/⌘V does the replace.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeElementText, writeElementTextAsync } from '@/content/inlineTranslate/writeback';
import { getElementText, isEditableElement } from '@/content/inlineTranslate/editable';
import {
  getActiveCopyPanel,
  removeCopyPanel,
  showCopyPanel,
  COPY_PANEL_CLASS,
} from '@/content/inlineTranslate/feedback';
import { runInlineTranslate, tryFallbackUndo } from '@/content/inlineTranslate/orchestrate';
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

function toQuillHtml(text: string): string {
  return text
    .split('\n')
    .map((l) => `<p>${l || '<br>'}</p>`)
    .join('');
}

/** Quill-shaped composer: .ql-container > .ql-editor[contenteditable]. */
function quillComposer(initialText = 'Hello') {
  const container = document.createElement('div');
  container.className = 'ql-container';
  const editor = document.createElement('div');
  editor.className = 'ql-editor';
  editor.contentEditable = 'true';
  editor.tabIndex = 0;
  editor.innerHTML = toQuillHtml(initialText);
  container.appendChild(editor);
  document.body.appendChild(container);
  editor.focus();
  return { container, editor };
}

interface FakeQuill {
  setText: ReturnType<typeof vi.fn>;
  getText: ReturnType<typeof vi.fn>;
  getLength: ReturnType<typeof vi.fn>;
  setSelection: ReturnType<typeof vi.fn>;
}

/** Minimal Quill stand-in: setText rewrites the DOM the way Quill renders. */
function fakeQuill(editor: HTMLElement): FakeQuill {
  return {
    setText: vi.fn((text: string) => {
      editor.innerHTML = toQuillHtml(text.replace(/\n$/, ''));
    }),
    getText: vi.fn(() => `${getElementText(editor)}\n`),
    getLength: vi.fn(() => getElementText(editor).length + 1),
    setSelection: vi.fn(),
  };
}

function composer(html: string): HTMLElement {
  const ce = document.createElement('div');
  ce.contentEditable = 'true';
  ce.tabIndex = 0;
  ce.innerHTML = html;
  document.body.appendChild(ce);
  ce.focus();
  return ce;
}

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

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
});

afterEach(() => {
  removeCopyPanel();
  // @ts-expect-error cleanup test stub
  delete navigator.clipboard;
  vi.useRealTimers();
});

/* ── Quill API write-back ──────────────────────────────────────── */

describe('framework API write-back (Quill)', () => {
  it('writes through the Quill instance exposed on the container, on both the async and sync paths', async () => {
    // facet: async write path
    const { container, editor } = quillComposer('Hello   ');
    const quill = fakeQuill(editor);
    (container as unknown as { __quill: FakeQuill }).__quill = quill;

    const res = await writeElementTextAsync(editor, 'Xin chào');

    expect(quill.setText).toHaveBeenCalledWith('Xin chào');
    expect(res.success).toBe(true);
    expect(res.strategy).toBe('framework-api');
    expect(getElementText(editor)).toBe('Xin chào');

    // facet: sync write path
    const { container: syncContainer, editor: syncEditor } = quillComposer('Hello');
    const syncQuill = fakeQuill(syncEditor);
    (syncContainer as unknown as { __quill: FakeQuill }).__quill = syncQuill;

    const syncRes = writeElementText(syncEditor, 'Xin chào');

    expect(syncQuill.setText).toHaveBeenCalledWith('Xin chào');
    expect(syncRes.success).toBe(true);
    expect(syncRes.strategy).toBe('framework-api');
  });

  it('still refuses a framework composer with no exposed instance', async () => {
    const { editor } = quillComposer('Hello');

    const res = await writeElementTextAsync(editor, 'Xin chào');

    expect(res).toEqual({ success: false, reason: 'framework-editor' });
    expect(getElementText(editor)).toBe('Hello');
  });

  it('refuses when the Quill call throws, leaving the draft intact', async () => {
    const { container, editor } = quillComposer('Hello');
    const quill = fakeQuill(editor);
    quill.setText.mockImplementation(() => {
      throw new Error('boom');
    });
    (container as unknown as { __quill: FakeQuill }).__quill = quill;

    const res = await writeElementTextAsync(editor, 'Xin chào');

    expect(res).toEqual({ success: false, reason: 'framework-editor' });
    expect(getElementText(editor)).toBe('Hello');
  });

  it('refuses when the editor API write cannot be verified', async () => {
    const { container, editor } = quillComposer('Hello');
    const quill = fakeQuill(editor);
    quill.setText.mockImplementation(() => {}); // accepts but DOM unchanged
    quill.getText.mockReturnValue('Hello\n');
    (container as unknown as { __quill: FakeQuill }).__quill = quill;

    const res = await writeElementTextAsync(editor, 'Xin chào');

    expect(res.success).toBe(false);
    expect(res.reason).toBe('framework-editor');
  });

  it('ignores a non-Quill __quill property', async () => {
    const { container, editor } = quillComposer('Hello');
    (container as unknown as { __quill: unknown }).__quill = { not: 'an editor' };

    const res = await writeElementTextAsync(editor, 'Xin chào');

    expect(res).toEqual({ success: false, reason: 'framework-editor' });
  });

  it('end-to-end: inline translate replaces a Quill draft instead of showing the copy panel', async () => {
    const { container, editor } = quillComposer('Hello   ');
    (container as unknown as { __quill: FakeQuill }).__quill = fakeQuill(editor);
    mockSendMessage.mockResolvedValueOnce({ success: true, translatedText: 'Xin chào' });

    await runInlineTranslate(cfg(), { element: editor, skipStripTrailing: false });

    expect(getElementText(editor)).toBe('Xin chào');
    expect(document.querySelector(`.${COPY_PANEL_CLASS}`)).toBeNull();
  });

  it('end-to-end: fallback undo restores the original through the Quill API', async () => {
    const { container, editor } = quillComposer('Hello');
    const quill = fakeQuill(editor);
    (container as unknown as { __quill: FakeQuill }).__quill = quill;
    mockSendMessage.mockResolvedValueOnce({ success: true, translatedText: 'Xin chào' });

    await runInlineTranslate(cfg(), { element: editor, skipStripTrailing: true });
    expect(getElementText(editor)).toBe('Xin chào');

    expect(tryFallbackUndo(editor)).toBe(true);
    expect(quill.setText).toHaveBeenLastCalledWith('Hello');
  });
});

/* ── Synthetic paste into framework composers ──────────────────── */

/**
 * jsdom ships neither constructor; stand-ins model exactly the two properties
 * the strategy and editor handlers rely on (spec: a synthetic clipboard
 * event's data store contains the data the script added).
 */
class FakeDataTransfer {
  private readonly entries = new Map<string, string>();
  setData(type: string, value: string): void {
    this.entries.set(type, value);
  }
  getData(type: string): string {
    return this.entries.get(type) ?? '';
  }
}

interface FakeClipboardEventInit extends EventInit {
  clipboardData?: FakeDataTransfer;
}

class FakeClipboardEvent extends Event {
  readonly clipboardData: FakeDataTransfer | null;
  constructor(type: string, init: FakeClipboardEventInit = {}) {
    super(type, init);
    this.clipboardData = init.clipboardData ?? null;
  }
}

/**
 * ProseMirror-shaped composer with a realistic paste pipeline: reads
 * text/plain from the event, applies it through "its model" (rewrites block
 * HTML), prevents default, and emits its own input event — exactly what PM's
 * view layer does for a real Ctrl+V.
 */
function pmComposer(initial = 'Hello'): HTMLElement {
  const ce = document.createElement('div');
  ce.className = 'ProseMirror';
  ce.contentEditable = 'true';
  ce.tabIndex = 0;
  ce.setAttribute('role', 'textbox');
  ce.innerHTML = `<p>${initial}</p>`;
  ce.addEventListener('paste', (event) => {
    const text = (event as unknown as FakeClipboardEvent).clipboardData?.getData('text/plain') ?? '';
    if (!text) return;
    event.preventDefault();
    ce.innerHTML = text
      .split('\n')
      .map((line) => `<p>${line || '<br>'}</p>`)
      .join('');
    ce.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
  });
  document.body.appendChild(ce);
  ce.focus();
  return ce;
}

describe('synthetic paste write-back (framework composers)', () => {
  beforeEach(() => {
    vi.stubGlobal('DataTransfer', FakeDataTransfer);
    vi.stubGlobal('ClipboardEvent', FakeClipboardEvent);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes into a ProseMirror composer through its own paste pipeline, multi-paragraph exact', async () => {
    const ce = pmComposer('Hello   ');
    // The engines only adopt a selection on selectionchange; the write must
    // nudge them before the paste lands (measured on PM 1.x / Lexical 0.23).
    const order: string[] = [];
    document.addEventListener('selectionchange', () => order.push('selectionchange'));
    ce.addEventListener('paste', () => order.push('paste'));

    const res = await writeElementTextAsync(ce, 'Xin chào\nthế giới');

    expect(res.success).toBe(true);
    expect(res.strategy).toBe('synthetic-paste');
    // Ordering is the contract: every nudge precedes the paste, and only one
    // paste is dispatched (jsdom also emits its own selectionchange events).
    expect(order.filter((e) => e === 'paste')).toHaveLength(1);
    expect(order.lastIndexOf('selectionchange')).toBeLessThan(order.indexOf('paste'));
    expect(getElementText(ce)).toBe('Xin chào\nthế giới');
    // Applied as editor-owned blocks, not a raw DOM text splice.
    expect(ce.querySelectorAll('p').length).toBe(2);
  });

  it('selects the field as a text range, not an element boundary, before pasting', async () => {
    // Measured: Lexical and Draft.js only adopt a range whose endpoints are
    // text nodes; an element-boundary selection makes them paste at their
    // stale model selection (translation next to the draft instead of over it).
    const ce = pmComposer('Hello');
    let selectionAtPaste: { anchorIsText: boolean; text: string } | null = null;
    // Capture phase on the document: read the selection before the composer's
    // own paste handler rewrites the field.
    const captureSelection = () => {
      const sel = window.getSelection()!;
      selectionAtPaste = {
        anchorIsText: sel.anchorNode?.nodeType === Node.TEXT_NODE,
        text: sel.toString(),
      };
    };
    document.addEventListener('paste', captureSelection, true);
    try {
      await writeElementTextAsync(ce, 'Xin chào');
    } finally {
      document.removeEventListener('paste', captureSelection, true);
    }

    expect(selectionAtPaste).not.toBeNull();
    expect(selectionAtPaste!.anchorIsText).toBe(true);
    expect(selectionAtPaste!.text).toBe('Hello');
  });

  it('retries with the native select-all when the first paste is ignored, and still refuses cleanly', async () => {
    const ce = document.createElement('div');
    ce.className = 'ProseMirror';
    ce.contentEditable = 'true';
    ce.tabIndex = 0;
    ce.innerHTML = '<p>Hello</p>';
    document.body.appendChild(ce);
    ce.focus();

    // An editor that only replaces the draft when the browser's own select-all
    // ran first (the rescue attempt).
    let selectAllCalls = 0;
    const execCommand = vi.fn((command: string) => {
      if (command !== 'selectAll') return false;
      selectAllCalls += 1;
      return true;
    });
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    ce.addEventListener('paste', (event) => {
      if (selectAllCalls === 0) return; // first attempt: ignored
      event.preventDefault();
      ce.innerHTML = '<p>Xin chào</p>';
      ce.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
    });

    const res = await writeElementTextAsync(ce, 'Xin chào');

    expect(execCommand).toHaveBeenCalledWith('selectAll');
    expect(res.success).toBe(true);
    expect(res.strategy).toBe('synthetic-paste');
    expect(getElementText(ce)).toBe('Xin chào');
  });

  it('uses the native insertText path for Draft.js composers, which never adopt a scripted selection', async () => {
    // Draft.js: measured 3/3 in Chromium — a synthetic paste inserts at its
    // stale model selection and leaves the draft in place, while the native
    // insertText command replaces the selected draft and keeps the model in
    // sync.
    const ce = document.createElement('div');
    ce.className = 'public-DraftEditor-content';
    ce.contentEditable = 'true';
    ce.tabIndex = 0;
    ce.innerHTML = '<div data-contents="true"><div data-block="true" data-offset-key="a-0-0">Hello</div></div>';
    document.body.appendChild(ce);
    ce.focus();

    let pasted = false;
    ce.addEventListener('paste', () => {
      pasted = true;
    });
    const execCommand = vi.fn((command: string, _ui: boolean, value?: string) => {
      if (command !== 'insertText') return false;
      ce.querySelector('[data-offset-key="a-0-0"]')!.textContent = value ?? '';
      ce.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      return true;
    });
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });

    const res = await writeElementTextAsync(ce, 'Xin chào');

    expect(execCommand).toHaveBeenCalledWith('insertText', false, 'Xin chào');
    expect(pasted).toBe(false);
    expect(res.success).toBe(true);
    expect(res.strategy).toBe('native-insert');
    expect(getElementText(ce)).toBe('Xin chào');
  });

  it('refuses a Draft.js composer cleanly when the native path cannot verify, leaving the draft intact', async () => {
    const ce = document.createElement('div');
    ce.className = 'public-DraftEditor-content';
    ce.contentEditable = 'true';
    ce.tabIndex = 0;
    ce.innerHTML = '<div data-contents="true"><div data-block="true" data-offset-key="a-0-0">Hello</div></div>';
    document.body.appendChild(ce);
    ce.focus();

    let pasted = false;
    ce.addEventListener('paste', () => {
      pasted = true;
    });
    Object.defineProperty(document, 'execCommand', { value: vi.fn(() => false), configurable: true });

    const res = await writeElementTextAsync(ce, 'Xin chào');

    expect(pasted).toBe(false);
    expect(res).toEqual({ success: false, reason: 'framework-editor' });
    expect(getElementText(ce)).toBe('Hello');
  });

  it('reports a clean refusal when the editor ignores the paste, leaving the draft intact', async () => {
    const ce = document.createElement('div');
    ce.className = 'ProseMirror';
    ce.contentEditable = 'true';
    ce.tabIndex = 0;
    ce.innerHTML = '<p>Hello</p>';
    document.body.appendChild(ce);
    ce.focus();

    const res = await writeElementTextAsync(ce, 'Xin chào');

    expect(res).toEqual({ success: false, reason: 'framework-editor' });
    expect(getElementText(ce)).toBe('Hello');
  });

  it('reports partial-change when the editor swallows the paste but leaves the draft altered', async () => {
    const ce = document.createElement('div');
    ce.className = 'ProseMirror';
    ce.contentEditable = 'true';
    ce.tabIndex = 0;
    ce.innerHTML = '<p>Hello</p>';
    // An editor that prevents default, mangles the text, and never matches.
    ce.addEventListener('paste', (event) => {
      event.preventDefault();
      ce.innerHTML = '<p>mangled</p>';
    });
    document.body.appendChild(ce);
    ce.focus();

    const res = await writeElementTextAsync(ce, 'Xin chào');

    expect(res).toEqual({ success: false, reason: 'partial-change' });
  });

  it('end-to-end: triple-space in a ProseMirror chat composer replaces the draft with no copy panel', async () => {
    const ce = pmComposer('xin chào   ');
    mockSendMessage.mockResolvedValueOnce({ success: true, translatedText: 'hello world' });

    await runInlineTranslate(cfg(), { element: ce, skipStripTrailing: false });

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'translateSelection', text: 'xin chào' }),
    );
    expect(getElementText(ce)).toBe('hello world');
    expect(document.querySelector(`.${COPY_PANEL_CLASS}`)).toBeNull();
  });

  it('prefers the editor-native API over the synthetic paste when both exist', async () => {
    const { container, editor } = quillComposer('Hello   ');
    const quill = fakeQuill(editor);
    (container as unknown as { __quill: FakeQuill }).__quill = quill;
    // A paste handler that would also work — must not be reached.
    editor.addEventListener('paste', (evt) => {
      evt.preventDefault();
      editor.innerHTML = '<p>via paste</p>';
    });

    const res = await writeElementTextAsync(editor, 'Xin chào');

    expect(quill.setText).toHaveBeenCalledWith('Xin chào');
    expect(res.strategy).toBe('framework-api');
  });
});

/* ── Redesigned copy panel ─────────────────────────────────────── */

describe('copy panel', () => {
  it('renders the translation in an editable field and never treats its own textarea as a translate target', () => {
    // facet: the translation renders in an editable field so it can be fixed before pasting
    const ce = composer('<p>Hello</p>');
    showCopyPanel(ce, 'Xin chào');

    const panel = getActiveCopyPanel()!;
    const textarea = panel.querySelector('textarea');

    expect(textarea).not.toBeNull();
    expect(textarea!.value).toBe('Xin chào');

    // facet: the panel's own textarea is not a translate target
    expect(isEditableElement(textarea!)).toBe(false);
  });

  it('primary action copies the translation and selects the draft for a real paste, and copies edited text when tweaked', async () => {
    // facet: primary action copies + focuses + selects the draft
    const ce = composer('<p>Hello</p>');
    const writeText = stubClipboard();
    showCopyPanel(ce, 'Xin chào');
    document.body.focus();

    const copy = getActiveCopyPanel()!.querySelector<HTMLButtonElement>(
      '.anyllm-inline-copy-panel__copy',
    )!;
    copy.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(writeText).toHaveBeenCalledWith('Xin chào');
    expect(document.activeElement).toBe(ce);
    expect(window.getSelection()?.toString()).toBe('Hello');

    // facet: the edited text is what gets copied
    const editedCe = composer('<p>Hello</p>');
    const writeEdited = stubClipboard();
    showCopyPanel(editedCe, 'Xin chào');

    const editedPanel = getActiveCopyPanel()!;
    const editedTextarea = editedPanel.querySelector('textarea')!;
    editedTextarea.value = 'Xin chào bạn';
    editedPanel.querySelector<HTMLButtonElement>('.anyllm-inline-copy-panel__copy')!.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(writeEdited).toHaveBeenCalledWith('Xin chào bạn');
  });

  it('points at the paste shortcut after copying and dismisses when the composer receives input', async () => {
    // facet: the panel points at the paste shortcut after copying
    const ce = composer('<p>Hello</p>');
    stubClipboard();
    showCopyPanel(ce, 'Xin chào');

    getActiveCopyPanel()!
      .querySelector<HTMLButtonElement>('.anyllm-inline-copy-panel__copy')!
      .click();
    await vi.advanceTimersByTimeAsync(0);

    expect(getActiveCopyPanel()!.textContent).toMatch(/Ctrl\+V|⌘V/);

    // facet: input on the composer means the paste landed → dismiss
    const pastedCe = composer('<p>Hello</p>');
    stubClipboard();
    showCopyPanel(pastedCe, 'Xin chào');
    getActiveCopyPanel()!
      .querySelector<HTMLButtonElement>('.anyllm-inline-copy-panel__copy')!
      .click();
    await vi.advanceTimersByTimeAsync(0);

    pastedCe.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));

    expect(getActiveCopyPanel()).toBeNull();
  });

  it('dismisses on Escape', () => {
    const ce = composer('<p>Hello</p>');
    showCopyPanel(ce, 'Xin chào');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(getActiveCopyPanel()).toBeNull();
  });
});
