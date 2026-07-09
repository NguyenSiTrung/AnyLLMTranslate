import { describe, it, expect } from 'vitest';
import {
  parseLanguagePrefix,
  LANGUAGE_PREFIX_ALIASES,
} from '@/lib/inlineTranslatePrefix';

describe('parseLanguagePrefix', () => {
  it('matches /en and strips prefix + space', () => {
    const result = parseLanguagePrefix('/en hello world');
    expect(result.targetLang).toBe('en');
    expect(result.body).toBe('hello world');
    expect(result.rawPrefix).toBe('/en');
  });

  it('matches aliases (zh, 中文, ja, 日语, vi)', () => {
    expect(parseLanguagePrefix('/zh 测试').targetLang).toBe('zh-CN');
    expect(parseLanguagePrefix('/中文 测试').targetLang).toBe('zh-CN');
    expect(parseLanguagePrefix('/ja こんにちは').targetLang).toBe('ja');
    expect(parseLanguagePrefix('/日语 こんにちは').targetLang).toBe('ja');
    expect(parseLanguagePrefix('/vi xin chào').targetLang).toBe('vi');
  });

  it('returns body unchanged when no prefix', () => {
    const result = parseLanguagePrefix('hello world');
    expect(result.targetLang).toBeUndefined();
    expect(result.body).toBe('hello world');
    expect(result.rawPrefix).toBeUndefined();
  });

  it('returns body unchanged when disabled', () => {
    const result = parseLanguagePrefix('/en hello', { enabled: false });
    expect(result.targetLang).toBeUndefined();
    expect(result.body).toBe('/en hello');
  });

  it('supports custom prefix character', () => {
    const result = parseLanguagePrefix('#en hello', { prefixChar: '#' });
    expect(result.targetLang).toBe('en');
    expect(result.body).toBe('hello');
    expect(result.rawPrefix).toBe('#en');
  });

  it('accepts bare BCP-47-like codes not in alias table', () => {
    const result = parseLanguagePrefix('/sv hej');
    expect(result.targetLang).toBe('sv');
    expect(result.body).toBe('hej');
  });

  it('does not match unknown non-code tokens', () => {
    const result = parseLanguagePrefix('/notalang hello');
    expect(result.targetLang).toBeUndefined();
    expect(result.body).toBe('/notalang hello');
  });

  it('handles prefix at end of text (empty body)', () => {
    const result = parseLanguagePrefix('/en');
    expect(result.targetLang).toBe('en');
    expect(result.body).toBe('');
  });

  it('exports a non-empty alias table', () => {
    expect(Object.keys(LANGUAGE_PREFIX_ALIASES).length).toBeGreaterThan(10);
  });
});
