import { describe, it, expect } from 'vitest';
import {
  detectLanguage,
  isSameLanguage,
  SAME_LANG_SKIP_CONFIDENCE,
} from '../langDetect';

describe('langDetect', () => {
  it('detects scripts/n-grams, handles empty/ambiguous, and compares language tags', () => {
    expect(detectLanguage('你好世界，今天天气真好').lang).toBe('zh');
    expect(detectLanguage('これは日本語のテストです').lang).toBe('ja');
    expect(detectLanguage('The quick brown fox jumps over the lazy dog').lang).toBe('en');
    expect(detectLanguage('Xin chào thế giới, hôm nay bạn khỏe không').lang).toBe('vi');

    // Expanded Latin set (it / id / nl / ro)
    expect(detectLanguage('Questo è un test della lingua italiana con le parole comuni').lang).toBe('it');
    expect(detectLanguage('Ini adalah teks bahasa Indonesia yang dan untuk dengan tidak').lang).toBe('id');
    expect(detectLanguage('Dit is een tekst in het Nederlands met de van en op te dat').lang).toBe('nl');
    expect(detectLanguage('Aceasta este o propoziție în limba română cu și pe pentru mai școală').lang).toBe('ro');

    expect(detectLanguage('')).toEqual({ lang: null, confidence: 0 });
    expect(detectLanguage('   \n\t  ')).toEqual({ lang: null, confidence: 0 });
    expect(detectLanguage('12345 67890 54321').lang).toBeNull();
    expect(detectLanguage('你好世界 hello 今天').lang).toBe('zh');

    expect(isSameLanguage('en', 'en')).toBe(true);
    expect(isSameLanguage('zh-Hans', 'zh-Hant')).toBe(true);
    expect(isSameLanguage('en-US', 'en-GB')).toBe(true);
    expect(isSameLanguage('en', 'vi')).toBe(false);
    expect(isSameLanguage('auto', 'en')).toBe(false);
    expect(isSameLanguage(null, 'en')).toBe(false);
  });

  it('FR-13: Ukrainian is not skipped as Russian; JP kanji-heavy not skipped as zh', () => {
    // Ukrainian with і/ї/є/ґ
    const uk = detectLanguage('Це український текст про свободу і незалежність країни');
    expect(uk.lang).toBe('uk');
    expect(uk.confidence).toBeGreaterThanOrEqual(0.7);
    // Must not equal ru for skip-as-complete when target is ru
    expect(isSameLanguage(uk.lang, 'ru')).toBe(false);

    // Japanese with kana + kanji
    const ja = detectLanguage('日本語の文章です。漢字が多くても仮名があれば日本語です。');
    expect(ja.lang).toBe('ja');

    // Han-only (no kana): confidence stays below skip bar so zh target won't
    // silently skip Japanese classical / ambiguous Han as "already zh".
    const hanOnly = detectLanguage('今日天気真好世界和平');
    expect(hanOnly.lang).toBe('zh');
    expect(hanOnly.confidence).toBeLessThan(SAME_LANG_SKIP_CONFIDENCE);

    // Soft Russian Cyrillic without Ukrainian markers stays below skip bar
    const softRu = detectLanguage('Это простой текст на кириллице без украинских букв');
    if (softRu.lang === 'ru') {
      expect(softRu.confidence).toBeLessThan(SAME_LANG_SKIP_CONFIDENCE);
    }
  });
});
