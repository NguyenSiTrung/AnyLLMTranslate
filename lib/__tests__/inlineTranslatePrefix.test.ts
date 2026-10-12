import { describe, expect, it } from 'vitest';
import {
  languagePrefixTokens,
  parseLanguagePrefix,
  resolveLanguageToken,
} from '@/lib/inlineTranslatePrefix';

describe('parseLanguagePrefix (refer parity)', () => {
  it('accepts one or two starting chars', () => {
    expect(parseLanguagePrefix('/en hello')).toMatchObject({
      targetLang: 'en',
      body: 'hello',
      rawPrefix: '/en',
    });
    expect(parseLanguagePrefix('//en hello')).toMatchObject({
      targetLang: 'en',
      body: 'hello',
      rawPrefix: '//en',
    });
    expect(parseLanguagePrefix('///en hello')).toEqual({ body: '///en hello' });
  });

  it('accepts full-width starting-key aliases', () => {
    expect(parseLanguagePrefix('、、英文 hello')).toMatchObject({ targetLang: 'en', body: 'hello' });
    expect(parseLanguagePrefix('、ja こんにちは').targetLang).toBe('ja');
    expect(parseLanguagePrefix('/、en hi').targetLang).toBe('en');
  });

  it('uses the configured starting key and its aliases', () => {
    expect(parseLanguagePrefix(';;ja x', { prefixChar: ';' })).toMatchObject({
      targetLang: 'ja',
      body: 'x',
    });
    expect(parseLanguagePrefix('；ko x', { prefixChar: ';' }).targetLang).toBe('ko');
    expect(parseLanguagePrefix('/en x', { prefixChar: ';' })).toEqual({ body: '/en x' });
  });

  it('`none` disables prefix parsing', () => {
    expect(parseLanguagePrefix('/en hello', { prefixChar: 'none' })).toEqual({
      body: '/en hello',
    });
  });

  it('prefix-only yields an empty body (not a translation request)', () => {
    expect(parseLanguagePrefix('//en')).toMatchObject({ targetLang: 'en', body: '' });
    expect(parseLanguagePrefix('/en   ')).toMatchObject({ targetLang: 'en', body: '' });
  });

  it('ignores the prefix when the starting key equals the trailing key', () => {
    expect(parseLanguagePrefix('/en hello', { prefixChar: '/', trailingKey: '/' })).toEqual({
      body: '/en hello',
    });
    expect(parseLanguagePrefix('/en hello', { prefixChar: '/', trailingKey: ' ' }).targetLang).toBe(
      'en',
    );
  });

  it('resolves language names from the supported list', () => {
    expect(parseLanguagePrefix('/japanese hi').targetLang).toBe('ja');
    expect(parseLanguagePrefix('/Deutsch hallo').targetLang).toBe('de');
    expect(parseLanguagePrefix('/Svenska hej').targetLang).toBe('sv');
    expect(parseLanguagePrefix('/lol that is funny')).toEqual({ body: '/lol that is funny' });
  });
});

describe('language code ↔ name aliases', () => {
  it('name → code', () => {
    expect(resolveLanguageToken('英文')).toBe('en');
    expect(resolveLanguageToken('英语')).toBe('en');
    expect(resolveLanguageToken('中文')).toBe('zh-CN');
    expect(resolveLanguageToken('zh')).toBe('zh-CN');
    expect(resolveLanguageToken('日文')).toBe('ja');
    expect(resolveLanguageToken('Tiếng')).toBeUndefined();
    expect(resolveLanguageToken('auto')).toBeUndefined();
  });

  it('code → names', () => {
    expect(languagePrefixTokens('en')).toEqual(expect.arrayContaining(['en', 'english', '英文']));
    expect(languagePrefixTokens('zh-CN')).toEqual(expect.arrayContaining(['zh', '中文']));
    expect(languagePrefixTokens('xx')).toEqual([]);
  });
});
