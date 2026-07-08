import { describe, it, expect } from 'vitest';
import { detectLanguage, isSameLanguage } from '../langDetect';

describe('langDetect', () => {
  describe('detectLanguage — strong script signals', () => {
    it('detects Chinese (CJK Han) with high confidence', () => {
      const r = detectLanguage('你好世界，今天天气真好');
      expect(r.lang).toBe('zh');
      expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('detects Japanese (Hiragana/Katakana) — prefers ja over zh when kana present', () => {
      const r = detectLanguage('これは日本語のテストです');
      expect(r.lang).toBe('ja');
      expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    });


  });

  describe('detectLanguage — Latin-script n-gram scoring', () => {
    it('detects English via stopword n-gram scoring', () => {
      const r = detectLanguage('The quick brown fox jumps over the lazy dog');
      expect(r.lang).toBe('en');
      expect(r.confidence).toBeGreaterThan(0.3);
    });

    it('detects Vietnamese via diacritics + n-grams', () => {
      const r = detectLanguage('Xin chào thế giới, hôm nay bạn khỏe không');
      expect(r.lang).toBe('vi');
      expect(r.confidence).toBeGreaterThan(0.3);
    });


  });

  describe('detectLanguage — edge cases', () => {
    it('returns null lang for empty input', () => {
      expect(detectLanguage('')).toEqual({ lang: null, confidence: 0 });
    });

    it('returns null lang for whitespace-only input', () => {
      expect(detectLanguage('   \n\t  ')).toEqual({ lang: null, confidence: 0 });
    });

    it('returns null lang with low confidence for ambiguous/digit-only text', () => {
      const r = detectLanguage('12345 67890 54321');
      expect(r.lang).toBeNull();
    });


  });

  describe('detectLanguage — mixed scripts', () => {
    it('returns the dominant script language for mixed content', () => {
      // Mostly Chinese with a stray Latin word.
      const r = detectLanguage('你好世界 hello 今天');
      expect(r.lang).toBe('zh');
    });


  });

  describe('isSameLanguage', () => {
    it('matches identical language codes', () => {
      expect(isSameLanguage('en', 'en')).toBe(true);
      expect(isSameLanguage('vi', 'vi')).toBe(true);
    });

    it('matches primary subtag (zh-Hans ≈ zh-Hant ≈ zh)', () => {
      expect(isSameLanguage('zh-Hans', 'zh')).toBe(true);
      expect(isSameLanguage('zh', 'zh-Hant')).toBe(true);
      expect(isSameLanguage('zh-Hans', 'zh-Hant')).toBe(true);
    });

    it('matches en-US with en-GB via primary subtag', () => {
      expect(isSameLanguage('en-US', 'en-GB')).toBe(true);
      expect(isSameLanguage('en-US', 'en')).toBe(true);
    });

    it('returns false for different primary subtags', () => {
      expect(isSameLanguage('en', 'vi')).toBe(false);
      expect(isSameLanguage('zh', 'ja')).toBe(false);
      expect(isSameLanguage('pt', 'es')).toBe(false);
    });

    it('treats "auto" as never-same (forces detection)', () => {
      expect(isSameLanguage('auto', 'en')).toBe(false);
      expect(isSameLanguage('en', 'auto')).toBe(false);
    });

    it('handles null/undefined gracefully', () => {
      expect(isSameLanguage(null, 'en')).toBe(false);
      expect(isSameLanguage('en', null)).toBe(false);
      expect(isSameLanguage(null, null)).toBe(false);
    });
  });
});
