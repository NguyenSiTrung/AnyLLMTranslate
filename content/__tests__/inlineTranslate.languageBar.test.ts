import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLanguageBar,
  hideLanguageBar,
  showLanguageBar,
  type LanguageBarOptions,
} from '@/content/inlineTranslate/languageBar';
import { undoMap } from '@/content/inlineTranslate/orchestrate';

vi.mock('@/lib/config', () => ({ loadSettings: vi.fn() }));

let field: HTMLTextAreaElement;
let unchanged = true;
let opts: LanguageBarOptions;

function q<T extends Element = HTMLElement>(sel: string): T | null {
  return getLanguageBar()?.shadowRoot?.querySelector<T>(sel) ?? null;
}
function qa(sel: string): HTMLElement[] {
  return Array.from(getLanguageBar()?.shadowRoot?.querySelectorAll<HTMLElement>(sel) ?? []);
}

beforeEach(() => {
  vi.useFakeTimers();
  field = document.createElement('textarea');
  field.value = 'hello';
  document.body.appendChild(field);
  undoMap.set(field, { text: 'xin chào', html: null });
  unchanged = true;
  opts = {
    field,
    targetLanguage: 'en',
    source: 'auto_selector',
    getOriginalDraft: () => undoMap.get(field)?.text,
    isUnchanged: () => unchanged,
    onRetarget: vi.fn(),
    onUndo: vi.fn(),
    persistTargetLanguage: vi.fn(),
  };
});

afterEach(() => {
  hideLanguageBar();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('target-language bar', () => {
  it('renders an owned shadow host with chip, source badge and Undo', () => {
    showLanguageBar(opts);
    const host = getLanguageBar()!;
    expect(host.hasAttribute('data-anyllm-owned')).toBe(true);
    expect(q('[data-part="chip"]')?.textContent).toContain('English');
    expect(q('[data-part="badge"]')?.textContent).toBe('auto');
    expect(q('[data-part="undo"]')).toBeTruthy();

    showLanguageBar({ ...opts, source: 'explicit' });
    expect(q('[data-part="badge"]')?.textContent).toBe('explicit');
    showLanguageBar({ ...opts, source: 'default' });
    expect(q('[data-part="badge"]')?.textContent).toBe('default');
    expect(document.querySelectorAll('[data-anyllm-role="inline-language-bar"]')).toHaveLength(1);
  });

  it('chip opens a searchable menu', () => {
    showLanguageBar(opts);
    expect(q('[data-part="menu"]')?.hidden).toBe(true);
    q('[data-part="chip"]')!.click();
    expect(q('[data-part="menu"]')?.hidden).toBe(false);
    const search = q<HTMLInputElement>('[data-part="search"]')!;
    search.value = 'japa';
    search.dispatchEvent(new Event('input'));
    const visible = qa('[data-lang]').filter((b) => !b.hidden);
    expect(visible.map((b) => b.dataset.lang)).toEqual(['ja']);
    search.value = '日本';
    search.dispatchEvent(new Event('input'));
    expect(qa('[data-lang]').filter((b) => !b.hidden).map((b) => b.dataset.lang)).toEqual(['ja']);
    search.value = 'ko';
    search.dispatchEvent(new Event('input'));
    expect(qa('[data-lang]').filter((b) => !b.hidden).map((b) => b.dataset.lang)).toContain('ko');
  });

  it('choosing a language persists it and retargets the original draft', () => {
    showLanguageBar(opts);
    q('[data-part="chip"]')!.click();
    q('[data-lang="ja"]')!.click();
    expect(opts.persistTargetLanguage).toHaveBeenCalledWith('ja');
    expect(opts.onRetarget).toHaveBeenCalledWith('ja', 'xin chào');
    expect(getLanguageBar()).toBeNull();
  });

  it('Undo calls onUndo and closes the bar', () => {
    showLanguageBar(opts);
    q('[data-part="undo"]')!.click();
    expect(opts.onUndo).toHaveBeenCalledTimes(1);
    expect(getLanguageBar()).toBeNull();
  });

  it('auto-hides after ~5 s of inactivity; interaction restarts the timer', () => {
    showLanguageBar(opts);
    vi.advanceTimersByTime(4000);
    q('[data-part="chip"]')!.dispatchEvent(new Event('pointermove', { bubbles: true }));
    vi.advanceTimersByTime(4000);
    expect(getLanguageBar()).not.toBeNull();
    vi.advanceTimersByTime(1000);
    expect(getLanguageBar()).toBeNull();
  });

  it('reopens on field focus while the translation is unchanged', () => {
    showLanguageBar(opts);
    vi.advanceTimersByTime(5000);
    expect(getLanguageBar()).toBeNull();
    field.dispatchEvent(new FocusEvent('focus'));
    expect(getLanguageBar()).not.toBeNull();

    vi.advanceTimersByTime(5000);
    unchanged = false;
    field.dispatchEvent(new FocusEvent('focus'));
    expect(getLanguageBar()).toBeNull();
    unchanged = true;
    field.dispatchEvent(new FocusEvent('focus'));
    expect(getLanguageBar()).toBeNull();
  });

  it('explicit hide stops reopening; Escape closes', () => {
    showLanguageBar(opts);
    hideLanguageBar();
    field.dispatchEvent(new FocusEvent('focus'));
    expect(getLanguageBar()).toBeNull();

    showLanguageBar(opts);
    q('[data-part="chip"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(getLanguageBar()).toBeNull();
  });
});
