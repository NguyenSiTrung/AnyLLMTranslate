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
    it('returns the English name for a valid code', () => {
      expect(getLanguageName('en')).toBe('English');
      expect(getLanguageName('vi')).toBe('Vietnamese');
      expect(getLanguageName('ja')).toBe('Japanese');
    });

    it('returns the code itself for an unknown code', () => {
      expect(getLanguageName('zz')).toBe('zz');
      expect(getLanguageName('unknown')).toBe('unknown');
    });
  });

  describe('getLanguageNativeName', () => {
    it('returns the native name for a valid code', () => {
      expect(getLanguageNativeName('vi')).toBe('Tiếng Việt');
      expect(getLanguageNativeName('ja')).toBe('日本語');
      expect(getLanguageNativeName('zh')).toBe('简体中文');
    });

    it('returns the code itself for an unknown code', () => {
      expect(getLanguageNativeName('xyz')).toBe('xyz');
    });
  });

  describe('getTargetLanguages', () => {
    it('excludes auto-detect', () => {
      const targets = getTargetLanguages();
      expect(targets.find((l) => l.code === 'auto')).toBeUndefined();
    });

    it('contains all non-auto languages', () => {
      const targets = getTargetLanguages();
      expect(targets.length).toBe(LANGUAGES.length - 1);
    });
  });

  describe('getSourceLanguages', () => {
    it('includes auto-detect', () => {
      const sources = getSourceLanguages();
      expect(sources.find((l) => l.code === 'auto')).toBeDefined();
    });

    it('returns all languages', () => {
      const sources = getSourceLanguages();
      expect(sources.length).toBe(LANGUAGES.length);
    });
  });

  describe('isValidLanguageCode', () => {
    it('returns true for valid codes', () => {
      expect(isValidLanguageCode('en')).toBe(true);
      expect(isValidLanguageCode('vi')).toBe(true);
      expect(isValidLanguageCode('auto')).toBe(true);
    });

    it('returns false for invalid codes', () => {
      expect(isValidLanguageCode('zz')).toBe(false);
      expect(isValidLanguageCode('')).toBe(false);
      expect(isValidLanguageCode('english')).toBe(false);
    });
  });
});
