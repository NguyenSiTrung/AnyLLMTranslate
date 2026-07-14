import { describe, it, expect } from 'vitest';
import { detectLanguage, isSameLanguage } from '../langDetect';

describe('langDetect', () => {
  it('detects scripts/n-grams, handles empty/ambiguous, and compares language tags', () => {
    expect(detectLanguage('你好世界，今天天气真好').lang).toBe('zh');
    expect(detectLanguage('これは日本語のテストです').lang).toBe('ja');
    expect(detectLanguage('The quick brown fox jumps over the lazy dog').lang).toBe('en');
    expect(detectLanguage('Xin chào thế giới, hôm nay bạn khỏe không').lang).toBe('vi');

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
});
