import { describe, it, expect } from 'vitest';
import { detectLanguage, isSameLanguage } from '../langDetect';

describe('langDetect', () => {
  it('detects strong script signals (zh / ja) and Latin n-grams (en / vi)', () => {
    expect(detectLanguage('你好世界，今天天气真好').lang).toBe('zh');
    expect(detectLanguage('これは日本語のテストです').lang).toBe('ja');
    expect(detectLanguage('The quick brown fox jumps over the lazy dog').lang).toBe('en');
    expect(detectLanguage('Xin chào thế giới, hôm nay bạn khỏe không').lang).toBe('vi');
  });

  it('returns null for empty/ambiguous input and prefers dominant script when mixed', () => {
    expect(detectLanguage('')).toEqual({ lang: null, confidence: 0 });
    expect(detectLanguage('   \n\t  ')).toEqual({ lang: null, confidence: 0 });
    expect(detectLanguage('12345 67890 54321').lang).toBeNull();
    expect(detectLanguage('你好世界 hello 今天').lang).toBe('zh');
  });

  it('isSameLanguage matches primary subtags and rejects auto/null/different langs', () => {
    expect(isSameLanguage('en', 'en')).toBe(true);
    expect(isSameLanguage('zh-Hans', 'zh-Hant')).toBe(true);
    expect(isSameLanguage('en-US', 'en-GB')).toBe(true);
    expect(isSameLanguage('en', 'vi')).toBe(false);
    expect(isSameLanguage('auto', 'en')).toBe(false);
    expect(isSameLanguage(null, 'en')).toBe(false);
  });
});
