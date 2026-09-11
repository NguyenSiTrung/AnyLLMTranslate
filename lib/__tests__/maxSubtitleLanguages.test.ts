// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  isTrackOptionChecked,
  normalizeMaxSubtitleLanguage,
  readMaxActiveSubtitleLanguage,
  MAX_LABEL_TO_LANGUAGE,
} from '@/lib/maxSubtitleLanguages';

function makeTrackButton(attrs: Record<string, string>, labelText?: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.setAttribute('data-testid', 'player-ux-text-track-button');
  for (const [key, value] of Object.entries(attrs)) btn.setAttribute(key, value);
  if (labelText !== undefined) btn.textContent = labelText;
  document.body.appendChild(btn);
  return btn;
}

describe('isTrackOptionChecked', () => {
  it.each([
    ['aria-checked', 'true'],
    ['aria-selected', 'true'],
    ['aria-pressed', 'true'],
    ['data-state', 'checked'],
  ])('treats %s="%s" as the checked track', (attr, value) => {
    const el = document.createElement('button');
    el.setAttribute(attr, value);
    expect(isTrackOptionChecked(el)).toBe(true);
  });

  it.each([
    ['aria-checked', 'false'],
    ['aria-selected', 'false'],
    ['aria-pressed', 'false'],
    ['data-state', 'unchecked'],
    ['data-state', ''],
  ])('treats %s="%s" as unchecked', (attr, value) => {
    const el = document.createElement('button');
    el.setAttribute(attr, value);
    expect(isTrackOptionChecked(el)).toBe(false);
  });

  it('is false without any checked-state attribute', () => {
    expect(isTrackOptionChecked(document.createElement('button'))).toBe(false);
  });
});

describe('readMaxActiveSubtitleLanguage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reads the label of a track marked with data-state="checked"', () => {
    makeTrackButton({ 'data-state': 'checked', 'aria-label': 'English' });
    expect(readMaxActiveSubtitleLanguage()).toBe('en');
  });

  it('reads the label of a track marked aria-pressed', () => {
    makeTrackButton({ 'aria-pressed': 'true', 'aria-label': 'Français' });
    expect(readMaxActiveSubtitleLanguage()).toBe('fr');
  });

  it('detects the checked state when it sits on a nested element', () => {
    const btn = makeTrackButton({ 'aria-label': 'Deutsch' });
    const inner = document.createElement('span');
    inner.setAttribute('aria-checked', 'true');
    btn.appendChild(inner);

    expect(readMaxActiveSubtitleLanguage()).toBe('de');
  });

  it('ignores unchecked tracks and reports "" for an Off selection', () => {
    makeTrackButton({ 'aria-checked': 'false', 'aria-label': 'English' });
    makeTrackButton({ 'aria-checked': 'true', 'aria-label': 'Off' });

    expect(readMaxActiveSubtitleLanguage()).toBe('');
  });
});

describe('normalizeMaxSubtitleLanguage', () => {
  it('prefers a label-map hit over a junk attrLang', () => {
    expect(normalizeMaxSubtitleLanguage('English', 'ui-locale')).toBe('en');
    expect(normalizeMaxSubtitleLanguage('Français', 'ui-locale')).toBe('fr');
  });

  it('uses attrLang when the label is unknown', () => {
    expect(normalizeMaxSubtitleLanguage('Unknown caption label', 'es-419')).toBe('es-419');
    expect(normalizeMaxSubtitleLanguage('', 'pt-BR')).toBe('pt-br');
  });

  it('strips parenthetical qualifiers and retries the map', () => {
    expect(normalizeMaxSubtitleLanguage('English (CC)')).toBe('en');
    expect(normalizeMaxSubtitleLanguage('German (Germany)')).toBe('de');
    // A qualifier that is itself part of a known label must still win exactly.
    expect(normalizeMaxSubtitleLanguage('Spanish (Latin America)')).toBe('es');
  });

  it('matches labels case-insensitively', () => {
    expect(normalizeMaxSubtitleLanguage('english')).toBe('en');
    expect(normalizeMaxSubtitleLanguage('CHINESE (SIMPLIFIED)')).toBe('zh-Hans');
  });

  it('ignores a junk attrLang when the label is unrecognized too', () => {
    expect(normalizeMaxSubtitleLanguage('Director commentary', 'ui-locale')).toBe(
      'director commentary',
    );
  });

  it('keeps every mapped label resolvable', () => {
    for (const [label, code] of Object.entries(MAX_LABEL_TO_LANGUAGE)) {
      expect(normalizeMaxSubtitleLanguage(label)).toBe(code);
    }
  });
});
