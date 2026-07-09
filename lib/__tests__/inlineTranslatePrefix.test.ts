import { describe, it, expect } from 'vitest';
import { parseLanguagePrefix, LANGUAGE_PREFIX_ALIASES } from '@/lib/inlineTranslatePrefix';

describe('parseLanguagePrefix', () => {
  it('parses aliases and BCP-47 codes; leaves body when no/invalid prefix', () => {
    expect(parseLanguagePrefix('/en hello world')).toMatchObject({
      targetLang: 'en',
      body: 'hello world',
      rawPrefix: '/en',
    });
    expect(parseLanguagePrefix('/zh 测试').targetLang).toBe('zh-CN');
    expect(parseLanguagePrefix('/中文 测试').targetLang).toBe('zh-CN');
    expect(parseLanguagePrefix('/vi xin chào').targetLang).toBe('vi');
    expect(parseLanguagePrefix('/sv hej').targetLang).toBe('sv');

    expect(parseLanguagePrefix('hello world').targetLang).toBeUndefined();
    expect(parseLanguagePrefix('/en hello', { enabled: false }).body).toBe('/en hello');
    expect(parseLanguagePrefix('/notalang hello').targetLang).toBeUndefined();
    expect(parseLanguagePrefix('/en')).toMatchObject({ targetLang: 'en', body: '' });
    expect(parseLanguagePrefix('#en hello', { prefixChar: '#' }).targetLang).toBe('en');
    expect(Object.keys(LANGUAGE_PREFIX_ALIASES).length).toBeGreaterThan(10);
  });
});
