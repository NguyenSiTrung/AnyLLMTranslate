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
});
