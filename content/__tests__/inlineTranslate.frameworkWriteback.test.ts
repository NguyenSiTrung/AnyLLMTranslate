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
