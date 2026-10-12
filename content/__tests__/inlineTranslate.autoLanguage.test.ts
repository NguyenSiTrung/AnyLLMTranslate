import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveAutoTargetLanguage,
  type AutoLanguageOptions,
} from '@/content/inlineTranslate/autoLanguage';

const JA = 'これは日本語のメッセージです。よろしくお願いします。';
const KO = '안녕하세요 오늘 날씨가 정말 좋네요 같이 산책할까요';
const RU_UK = 'Привіт, як справи? Це дуже цікава історія для всіх.';
const EN = 'Hello there, this is the message that you wanted to read and reply to';

function opts(partial: Partial<AutoLanguageOptions> = {}): AutoLanguageOptions {
  return {
    autoLanguageEnable: true,
    autoLanguagePageEnable: false,
    autoLanguageSelectors: [],
    targetLanguage: 'en',
    ...partial,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('lang');
});

describe('resolveAutoTargetLanguage', () => {
  it('parentElementTo uses the closest ancestor and its first match only', () => {
    document.body.innerHTML = `
      <div class="thread">
        <p class="msg">${JA}</p>
        <p class="msg">${KO}</p>
        <textarea id="f"></textarea>
      </div>
      <div class="thread"><p class="msg">${RU_UK}</p></div>`;
    const field = document.getElementById('f')!;
    const result = resolveAutoTargetLanguage(
      field,
      opts({ autoLanguageSelectors: ['parentElementTo .thread .msg'] }),
    );
    expect(result).toEqual({ lang: 'ja', source: 'auto_selector' });
  });

  it('parentElementTo without a matching ancestor does not match', () => {
    document.body.innerHTML = `<p class="msg">${JA}</p><textarea id="f"></textarea>`;
    const field = document.getElementById('f')!;
    expect(
      resolveAutoTargetLanguage(field, opts({ autoLanguageSelectors: ['parentElementTo .thread .msg'] })),
    ).toEqual({ lang: 'en', source: 'default' });
  });

  it('plain selectors read all matches', () => {
    document.body.innerHTML = `
      <p class="msg">ok</p><p class="msg">${KO}</p><p class="msg">${KO}</p>
      <textarea id="f"></textarea>`;
    const field = document.getElementById('f')!;
    expect(resolveAutoTargetLanguage(field, opts({ autoLanguageSelectors: ['.msg'] }))).toEqual({
      lang: 'ko',
      source: 'auto_selector',
    });
  });

  it('tries selectors in order; first with a detectable language wins', () => {
    document.body.innerHTML = `
      <p class="a"></p><p class="b">${KO}</p><p class="c">${JA}</p>
      <textarea id="f"></textarea>`;
    const field = document.getElementById('f')!;
    expect(
      resolveAutoTargetLanguage(field, opts({ autoLanguageSelectors: ['.missing', '.a', '.b', '.c'] })),
    ).toEqual({ lang: 'ko', source: 'auto_selector' });
  });

  it('excludes our injected nodes and the field itself', () => {
    document.body.innerHTML = `
      <div class="msg">${EN}<span class="anyllm-translate-translation">${JA}</span>
        <span data-anyllm-owned="1">${JA}</span></div>
      <div class="msg"><textarea id="f">${JA}</textarea></div>`;
    const field = document.getElementById('f')!;
    expect(resolveAutoTargetLanguage(field, opts({ autoLanguageSelectors: ['.msg'], targetLanguage: 'vi' })))
      .toEqual({ lang: 'en', source: 'auto_selector' });
  });

  it('skips selectors when autoLanguageEnable is off; invalid selectors are ignored', () => {
    document.body.innerHTML = `<p class="msg">${JA}</p><textarea id="f"></textarea>`;
    const field = document.getElementById('f')!;
    expect(
      resolveAutoTargetLanguage(
        field,
        opts({ autoLanguageEnable: false, autoLanguageSelectors: ['.msg'], targetLanguage: 'fr' }),
      ),
    ).toEqual({ lang: 'fr', source: 'default' });
    expect(
      resolveAutoTargetLanguage(field, opts({ autoLanguageSelectors: ['p[', '.msg'] })),
    ).toEqual({ lang: 'ja', source: 'auto_selector' });
  });

  it('falls back to the page language only when enabled', () => {
    document.documentElement.lang = 'de-DE';
    document.body.innerHTML = '<textarea id="f"></textarea>';
    const field = document.getElementById('f')!;
    expect(resolveAutoTargetLanguage(field, opts())).toEqual({ lang: 'en', source: 'default' });
    expect(resolveAutoTargetLanguage(field, opts({ autoLanguagePageEnable: true }))).toEqual({
      lang: 'de',
      source: 'auto_page',
    });
    document.documentElement.lang = 'zh-Hant-TW';
    expect(resolveAutoTargetLanguage(field, opts({ autoLanguagePageEnable: true })).lang).toBe('zh-TW');
  });

  it('page fallback detects the body text when <html lang> is missing or unsupported', () => {
    document.body.innerHTML = `<main>${JA}</main><textarea id="f"></textarea>`;
    const field = document.getElementById('f')!;
    expect(resolveAutoTargetLanguage(field, opts({ autoLanguagePageEnable: true }))).toEqual({
      lang: 'ja',
      source: 'auto_page',
    });
  });
});
