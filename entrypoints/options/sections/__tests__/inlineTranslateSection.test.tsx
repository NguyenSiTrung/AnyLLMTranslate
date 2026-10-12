import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_INLINE_TRANSLATE_SETTINGS, DEFAULT_SETTINGS } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { InlineTranslateSection } from '../InlineTranslateSection';

vi.stubGlobal('chrome', {
  storage: {
    local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: { sendMessage: vi.fn(async () => ({ success: true })), onMessage: { addListener: vi.fn() } },
});

const updateSettings = vi.fn();

function setInline(partial: Partial<typeof DEFAULT_INLINE_TRANSLATE_SETTINGS> = {}) {
  useSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    isLoaded: true,
    inlineTranslate: { ...DEFAULT_INLINE_TRANSLATE_SETTINGS, enabled: true, ...partial },
    updateSettings,
  });
}

/** Last inlineTranslate object written through the store. */
function lastInline() {
  return updateSettings.mock.calls.at(-1)?.[0]?.inlineTranslate;
}

function optionValues(select: HTMLElement): string[] {
  return within(select)
    .getAllByRole('option')
    .map((o) => (o as HTMLOptionElement).value);
}

function slider(container: HTMLElement, id: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`#${id}`);
  if (!el) throw new Error(`missing slider ${id}`);
  return el;
}

beforeEach(() => {
  updateSettings.mockReset();
  setInline();
});

describe('InlineTranslateSection — refer surface', () => {
  it('trailing key select writes triggerKey', () => {
    render(<InlineTranslateSection />);
    const trailing = screen.getByLabelText('Trailing key');
    expect(optionValues(trailing)).toEqual([' ', '/', '=', ';', ',', '.', ':']);
    fireEvent.change(trailing, { target: { value: ';' } });
    expect(lastInline()).toMatchObject({ triggerKey: ';' });
  });

  it('starting key offers none + keys, excluding the trailing key', () => {
    setInline({ triggerKey: '/', languagePrefix: ';' });
    render(<InlineTranslateSection />);
    const starting = screen.getByLabelText('Starting key');
    expect(optionValues(starting)).toEqual(['none', '=', ';', ',', '.', ':']);
    expect((starting as HTMLSelectElement).value).toBe(';');

    fireEvent.change(starting, { target: { value: 'none' } });
    expect(lastInline()).toMatchObject({ enableLanguagePrefix: false });

    fireEvent.change(starting, { target: { value: '=' } });
    expect(lastInline()).toMatchObject({ enableLanguagePrefix: true, languagePrefix: '=' });
  });

  it('shows none when the prefix is disabled', () => {
    setInline({ enableLanguagePrefix: false });
    render(<InlineTranslateSection />);
    expect((screen.getByLabelText('Starting key') as HTMLSelectElement).value).toBe('none');
  });

  it('choosing the starting key as trailing key turns the prefix off', () => {
    setInline({ triggerKey: ' ', languagePrefix: '/', enableLanguagePrefix: true });
    render(<InlineTranslateSection />);
    fireEvent.change(screen.getByLabelText('Trailing key'), { target: { value: '/' } });
    expect(lastInline()).toMatchObject({ triggerKey: '/', enableLanguagePrefix: false });
  });

  it('combo interval slider spans 150–1000 ms', () => {
    const { container } = render(<InlineTranslateSection />);
    const combo = slider(container, 'inline-translate-combo-interval');
    expect(combo.min).toBe('150');
    expect(combo.max).toBe('1000');
    fireEvent.change(combo, { target: { value: '400' } });
    expect(lastInline()).toMatchObject({ triggerTimeoutMs: 400 });
  });

  it('gesture and auto-language toggles write settings', () => {
    render(<InlineTranslateSection />);
    fireEvent.click(screen.getByRole('switch', { name: /Key gesture/i }));
    expect(lastInline()).toMatchObject({ gestureEnabled: false });
    fireEvent.click(screen.getByRole('switch', { name: /conversation's language/i }));
    expect(lastInline()).toMatchObject({ autoLanguageEnable: false });
    fireEvent.click(screen.getByRole('switch', { name: /page language/i }));
    expect(lastInline()).toMatchObject({ autoLanguagePageEnable: true });
  });

  it('Advanced disclosure knobs write settings', () => {
    const { container } = render(<InlineTranslateSection />);
    const toggle = screen.getByRole('button', { name: /Advanced options/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);

    const cases: [string, string, Record<string, number>][] = [
      ['inline-translate-tap-count', '4', { tapCount: 4 }],
      ['inline-translate-tap-gap', '300', { triggerGapMs: 300 }],
      ['inline-translate-idle-ms', '400', { idleMs: 400 }],
      ['inline-translate-tolerance', '1', { triggerToleranceCount: 1 }],
      ['inline-translate-cancel-window', '5000', { cancelWindowMs: 5000 }],
      ['inline-translate-min-duration', '500', { minDurationMs: 500 }],
      ['inline-translate-long-text', '400', { confirmLongTextLength: 400 }],
    ];
    for (const [id, value, expected] of cases) {
      fireEvent.change(slider(container, id), { target: { value } });
      expect(lastInline(), id).toMatchObject(expected);
    }

    fireEvent.click(screen.getByRole('switch', { name: /Confirm long text/i }));
    expect(lastInline()).toMatchObject({ confirmLongText: false });
    fireEvent.click(screen.getByRole('switch', { name: /Target-language bar/i }));
    expect(lastInline()).toMatchObject({ enableTargetLanguageBar: false });
    fireEvent.click(screen.getByRole('switch', { name: /Fallback Undo/i }));
    expect(lastInline()).toMatchObject({ enableFallbackUndo: false });
  });

  it('preview reflects the starting key and the trailing key', () => {
    setInline({ triggerKey: ';', languagePrefix: '/', tapCount: 3 });
    render(<InlineTranslateSection />);
    const preview = screen.getByTestId('inline-translate-preview');
    expect(preview.textContent).toContain('//en hello world');
    expect(preview.textContent).toContain('; × 3');

    setInline({ enableLanguagePrefix: false, targetLanguage: 'ja' });
    render(<InlineTranslateSection />);
    expect(screen.getAllByTestId('inline-translate-preview').at(-1)?.textContent).not.toContain('//en');
  });
});
