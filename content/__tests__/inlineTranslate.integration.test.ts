/**
 * End-to-end inline pipeline with the in-page UI: gesture / Alt+I → overlay
 * (held ≥ minDurationMs) → write → language-bar retarget → Undo, plus the
 * first-use guide and long-text confirm gates.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getInlineTranslateConfig,
  initInlineTranslate,
  removeToast,
  translateFocusedInput,
  updateInlineTranslateConfig,
} from '@/content/inlineTranslate';
import { __resetInlinePromptsForTest } from '@/content/inlineTranslate/orchestrate';
import { getLoadingOverlay } from '@/content/inlineTranslate/overlay';
import { getLanguageBar } from '@/content/inlineTranslate/languageBar';
import { getInlineModal } from '@/content/inlineTranslate/modals';
import { DEFAULT_INLINE_TRANSLATE_SETTINGS } from '@/types/config';
import { updateSettings } from '@/lib/config';

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    sourceLanguage: 'auto',
    targetLanguage: 'en',
    inlineTranslate: { targetLanguage: 'en' },
  }),
  updateSettings: vi.fn().mockResolvedValue({}),
}));

const mockSendMessage = vi.fn();
let cleanup: () => void;

const bar = (sel: string) => getLanguageBar()?.shadowRoot?.querySelector<HTMLElement>(sel) ?? null;
const modal = (sel: string) => getInlineModal()?.shadowRoot?.querySelector<HTMLElement>(sel) ?? null;

function textarea(value: string): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  ta.value = value;
  document.body.appendChild(ta);
  ta.focus();
  ta.setSelectionRange(value.length, value.length);
  return ta;
}

function spaceTaps(el: Element, n = 3): void {
  for (let i = 0; i < n; i++) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
  }
}

function lastRequest(): { text: string; targetLanguage: string } {
  return mockSendMessage.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(globalThis, 'chrome', {
    value: {
      runtime: { sendMessage: mockSendMessage },
      storage: { local: { get: vi.fn(), set: vi.fn() }, onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
    },
    writable: true,
    configurable: true,
  });
  mockSendMessage.mockReset();
  vi.mocked(updateSettings).mockClear();
  document.body.innerHTML = '';
  __resetInlinePromptsForTest();
  updateInlineTranslateConfig({
    ...DEFAULT_INLINE_TRANSLATE_SETTINGS,
    enabled: true,
    targetLanguage: 'en',
    inlineGuideShown: true,
    blocklistPatterns: [],
  });
  cleanup = initInlineTranslate();
});

afterEach(() => {
  cleanup();
  removeToast();
  vi.useRealTimers();
});

describe('inline pipeline with in-page UI', () => {
  it('textarea: gesture → overlay ≥ 1.5 s → write → retarget → Undo', async () => {
    const ta = textarea('xin chào   ');
    mockSendMessage.mockResolvedValueOnce({ success: true, translatedText: 'hello' });

    spaceTaps(ta);
    await vi.advanceTimersByTimeAsync(260);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toMatchObject({ text: 'xin chào', targetLanguage: 'en' });
    expect(getLoadingOverlay()).not.toBeNull();
    expect(ta.value).toBe('xin chào   ');

    await vi.advanceTimersByTimeAsync(1000);
    expect(ta.value).toBe('xin chào   ');
    expect(getLoadingOverlay()).not.toBeNull();

    // Fired at 250 ms (idle window) → held until 250 + 1500 ms.
    await vi.advanceTimersByTimeAsync(480);
    expect(ta.value).toBe('xin chào   ');
    await vi.advanceTimersByTimeAsync(20);
    expect(ta.value).toBe('hello');
    expect(getLoadingOverlay()).toBeNull();
    expect(bar('[data-part="badge"]')?.textContent).toBe('default');

    // Retarget: persists the language and re-translates the original draft.
    mockSendMessage.mockResolvedValueOnce({ success: true, translatedText: 'こんにちは' });
    bar('[data-part="chip"]')!.click();
    bar('[data-lang="ja"]')!.click();
    await vi.advanceTimersByTimeAsync(10);
    expect(updateSettings).toHaveBeenCalledWith({
      inlineTranslate: expect.objectContaining({ targetLanguage: 'ja' }),
    });
    expect(lastRequest()).toMatchObject({ text: 'xin chào', targetLanguage: 'ja' });
    expect(ta.value).toBe('hello');
    expect(getLoadingOverlay()).not.toBeNull();

    await vi.advanceTimersByTimeAsync(1600);
    expect(ta.value).toBe('こんにちは');
    expect(bar('[data-part="badge"]')?.textContent).toBe('explicit');
    expect(bar('[data-part="chip"]')?.textContent).toContain('Japanese');

    // Undo restores the very first draft.
    bar('[data-part="undo"]')!.click();
    expect(ta.value).toBe('xin chào   ');
    expect(getLanguageBar()).toBeNull();
  });

  it('contentEditable: Alt+I → held write → bar → Undo restores markup', async () => {
    const ce = document.createElement('div');
    ce.contentEditable = 'true';
    ce.tabIndex = 0;
    ce.innerHTML = '<p>xin <b>chào</b></p>';
    document.body.appendChild(ce);
    ce.focus();
    mockSendMessage.mockResolvedValueOnce({ success: true, translatedText: 'hello' });

    void translateFocusedInput();
    await vi.advanceTimersByTimeAsync(1000);
    expect(lastRequest()).toMatchObject({ text: 'xin chào' });
    expect(ce.textContent).toBe('xin chào');
    expect(getLoadingOverlay()).not.toBeNull();

    await vi.advanceTimersByTimeAsync(600);
    expect(ce.textContent).toBe('hello');
    expect(getLanguageBar()).not.toBeNull();

    bar('[data-part="undo"]')!.click();
    expect(ce.innerHTML).toBe('<p>xin <b>chào</b></p>');
  });

  it('typing inside the cancel window aborts: no write, overlay gone', async () => {
    const ta = textarea('xin chào   ');
    mockSendMessage.mockResolvedValueOnce({ success: true, translatedText: 'hello' });
    spaceTaps(ta);
    await vi.advanceTimersByTimeAsync(500);
    ta.value = 'xin chào   !';
    ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '!' }));
    expect(getLoadingOverlay()).toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect(ta.value).toBe('xin chào   !');
    expect(getLanguageBar()).toBeNull();
  });

  it('first gesture shows the guide once; Enable continues the translation', async () => {
    updateInlineTranslateConfig({ inlineGuideShown: false });
    const ta = textarea('xin chào   ');
    mockSendMessage.mockResolvedValue({ success: true, translatedText: 'hello' });

    spaceTaps(ta);
    await vi.advanceTimersByTimeAsync(260);
    expect(getInlineModal()).not.toBeNull();
    expect(mockSendMessage).not.toHaveBeenCalled();

    modal('[data-action="enable"]')!.click();
    await vi.advanceTimersByTimeAsync(1600);
    expect(updateSettings).toHaveBeenCalledWith({
      inlineTranslate: expect.objectContaining({ inlineGuideShown: true }),
    });
    expect(ta.value).toBe('hello');
  });

  it('guide Turn off disables the feature without translating', async () => {
    updateInlineTranslateConfig({ inlineGuideShown: false });
    const ta = textarea('xin chào   ');
    spaceTaps(ta);
    await vi.advanceTimersByTimeAsync(260);
    modal('[data-action="turn-off"]')!.click();
    await vi.advanceTimersByTimeAsync(10);
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(getInlineTranslateConfig().enabled).toBe(false);
    expect(updateSettings).toHaveBeenCalledWith({
      inlineTranslate: expect.objectContaining({ enabled: false, inlineGuideShown: true }),
    });
  });

  it('long text asks first; Cancel sends nothing and keeps the draft', async () => {
    const draft = 'x'.repeat(250);
    const ta = textarea(draft);
    void translateFocusedInput();
    await vi.advanceTimersByTimeAsync(10);
    expect(modal('[role="dialog"]')?.textContent).toContain('250');
    modal('[data-action="cancel"]')!.click();
    await vi.advanceTimersByTimeAsync(10);
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(ta.value).toBe(draft);
  });
});
