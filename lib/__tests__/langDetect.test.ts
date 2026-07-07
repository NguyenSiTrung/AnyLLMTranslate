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

    it('detects Korean (Hangul)', () => {
      const r = detectLanguage('안녕하세요 반갑습니다');
      expect(r.lang).toBe('ko');
      expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('detects Russian (Cyrillic)', () => {
      const r = detectLanguage('Привет мир, как дела сегодня');
      expect(r.lang).toBe('ru');
      expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('detects Arabic', () => {
      const r = detectLanguage('مرحبا بالعالم كيف حالك اليوم');
      expect(r.lang).toBe('ar');
      expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('detects Hebrew', () => {
      const r = detectLanguage('שלום עולם מה שלומך היום');
      expect(r.lang).toBe('he');
      expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('detects Thai', () => {
      const r = detectLanguage('สวัสดีครับ สบายดีไหมวันนี้');
      expect(r.lang).toBe('th');
      expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('detects Hindi (Devanagari)', () => {
      const r = detectLanguage('नमस्ते दुनिया आज कैसे हो');
      expect(r.lang).toBe('hi');
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

    it('detects Spanish', () => {
      const r = detectLanguage('Hola mundo, cómo estás hoy en la mañana');
      expect(r.lang).toBe('es');
    });

    it('detects French', () => {
      const r = detectLanguage('Bonjour le monde, comment allez-vous aujourd\'hui');
      expect(r.lang).toBe('fr');
    });

    it('detects German', () => {
      const r = detectLanguage('Hallo Welt, wie geht es dir heute morgen');
      expect(r.lang).toBe('de');
    });

    it('detects Portuguese', () => {
      const r = detectLanguage('Olá mundo, como você está hoje de manhã');
      expect(r.lang).toBe('pt');
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

    it('returns null lang for very short ambiguous text', () => {
      const r = detectLanguage('ok');
      expect(r.lang).toBeNull();
    });

    it('handles punctuation-only or symbol-heavy text', () => {
      const r = detectLanguage('!!! ??? ... ---');
      expect(r.lang).toBeNull();
    });
  });

  describe('detectLanguage — mixed scripts', () => {
    it('returns the dominant script language for mixed content', () => {
      // Mostly Chinese with a stray Latin word.
      const r = detectLanguage('你好世界 hello 今天');
      expect(r.lang).toBe('zh');
    });

    it('detects the script language even with surrounding latin whitespace/punct', () => {
      const r = detectLanguage('  -- 안녕하세요 -- ');
      expect(r.lang).toBe('ko');
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
