import { describe, it, expect } from 'vitest';
import {
  getLanguageName,
  getLanguageNativeName,
  getTargetLanguages,
  getSourceLanguages,
  isValidLanguageCode,
  LANGUAGES,
} from '../languages';

describe('languages', () => {
  it('catalog, lookups, source/target split, and code validation', () => {
    expect(LANGUAGES[0]!.code).toBe('auto');
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);

    expect(getLanguageName('vi')).toBe('Vietnamese');
    expect(getLanguageName('zz')).toBe('zz');
    expect(getLanguageNativeName('vi')).toBe('Tiếng Việt');
    expect(getLanguageNativeName('xyz')).toBe('xyz');

    expect(getSourceLanguages().length).toBe(LANGUAGES.length);
    expect(getSourceLanguages().find((l) => l.code === 'auto')).toBeDefined();
    expect(getTargetLanguages().find((l) => l.code === 'auto')).toBeUndefined();
    expect(getTargetLanguages().length).toBe(LANGUAGES.length - 1);

    expect(isValidLanguageCode('vi')).toBe(true);
    expect(isValidLanguageCode('english')).toBe(false);
  });

  it('covers the Max track languages that were missing, with one auto entry (MAX-36/MPD-11)', () => {
    const codes = LANGUAGES.map((l) => l.code);
    // Max exposes these tracks; without a picker entry the user could not
    // prefer them (the preference UI only offers catalog languages).
    for (const code of ['nb', 'sl', 'et', 'lv', 'lt', 'ca']) {
      expect(codes).toContain(code);
      expect(isValidLanguageCode(code)).toBe(true);
    }

    expect(getLanguageName('nb')).toBe('Norwegian Bokmål');
    expect(getLanguageNativeName('nb')).toBe('Norsk bokmål');
    expect(getLanguageName('sl')).toBe('Slovenian');
    expect(getLanguageNativeName('sl')).toBe('Slovenščina');
    expect(getLanguageName('et')).toBe('Estonian');
    expect(getLanguageNativeName('et')).toBe('Eesti');
    expect(getLanguageName('lv')).toBe('Latvian');
    expect(getLanguageNativeName('lv')).toBe('Latviešu');
    expect(getLanguageName('lt')).toBe('Lithuanian');
    expect(getLanguageNativeName('lt')).toBe('Lietuvių');
    expect(getLanguageName('ca')).toBe('Catalan');
    expect(getLanguageNativeName('ca')).toBe('Català');

    expect(codes.filter((code) => code === 'auto')).toHaveLength(1);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
