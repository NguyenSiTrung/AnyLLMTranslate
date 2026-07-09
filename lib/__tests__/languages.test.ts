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
  it('includes auto-detect first and unique codes', () => {
    expect(LANGUAGES[0].code).toBe('auto');
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('looks up English and native names (fallback to code when unknown)', () => {
    expect(getLanguageName('vi')).toBe('Vietnamese');
    expect(getLanguageName('zz')).toBe('zz');
    expect(getLanguageNativeName('vi')).toBe('Tiếng Việt');
    expect(getLanguageNativeName('xyz')).toBe('xyz');
  });

  it('splits source (incl. auto) vs target (excl. auto) lists', () => {
    expect(getSourceLanguages().length).toBe(LANGUAGES.length);
    expect(getSourceLanguages().find((l) => l.code === 'auto')).toBeDefined();
    expect(getTargetLanguages().find((l) => l.code === 'auto')).toBeUndefined();
    expect(getTargetLanguages().length).toBe(LANGUAGES.length - 1);
  });

  it('validates known language codes', () => {
    expect(isValidLanguageCode('vi')).toBe(true);
    expect(isValidLanguageCode('english')).toBe(false);
  });
});
