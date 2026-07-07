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
  describe('LANGUAGES', () => {
    it('contains at least 30 languages', () => {
      expect(LANGUAGES.length).toBeGreaterThanOrEqual(30);
    });

    it('includes auto-detect as first entry', () => {
      expect(LANGUAGES[0].code).toBe('auto');
      expect(LANGUAGES[0].name).toBe('Auto-Detect');
    });

    it('has unique codes', () => {
      const codes = LANGUAGES.map((l) => l.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('every language has code, name, and nativeName', () => {
      for (const lang of LANGUAGES) {
        expect(lang.code).toBeTruthy();
        expect(lang.name).toBeTruthy();
        expect(lang.nativeName).toBeTruthy();
      }
    });
  });

  describe('getLanguageName', () => {
    it('returns the English name for a valid code, and the code itself when unknown', () => {
      expect(getLanguageName('vi')).toBe('Vietnamese');
      expect(getLanguageName('zz')).toBe('zz');
    });
  });

  describe('getLanguageNativeName', () => {
    it('returns the native name for a valid code, and the code itself when unknown', () => {
      expect(getLanguageNativeName('vi')).toBe('Tiếng Việt');
      expect(getLanguageNativeName('xyz')).toBe('xyz');
    });
  });

  describe('getTargetLanguages', () => {
    it('excludes auto-detect and contains all non-auto languages', () => {
      const targets = getTargetLanguages();
      expect(targets.find((l) => l.code === 'auto')).toBeUndefined();
      expect(targets.length).toBe(LANGUAGES.length - 1);
    });
  });

  describe('getSourceLanguages', () => {
    it('includes auto-detect and returns all languages', () => {
      const sources = getSourceLanguages();
      expect(sources.find((l) => l.code === 'auto')).toBeDefined();
      expect(sources.length).toBe(LANGUAGES.length);
    });
  });

  describe('isValidLanguageCode', () => {
    it('returns true for valid codes and false for invalid ones', () => {
      expect(isValidLanguageCode('vi')).toBe(true);
      expect(isValidLanguageCode('english')).toBe(false);
    });
  });
});
