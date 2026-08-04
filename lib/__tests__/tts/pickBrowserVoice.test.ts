import { describe, it, expect } from 'vitest';
import {
  normalizeSpeechLang,
  pickBrowserVoice,
  scoreVoiceForLang,
  type VoiceLike,
} from '@/lib/tts/pickBrowserVoice';

function voice(
  lang: string,
  opts: Partial<Pick<VoiceLike, 'name' | 'localService' | 'default'>> = {},
): VoiceLike {
  return {
    lang,
    name: opts.name ?? `Voice ${lang}`,
    localService: opts.localService ?? false,
    default: opts.default ?? false,
  };
}

describe('normalizeSpeechLang / scoreVoiceForLang', () => {
  it('normalizes empty, language-code, and region-tag speech languages; scores exact and primary matches above unrelated languages', () => {
    expect(normalizeSpeechLang(undefined)).toBeUndefined();
    expect(normalizeSpeechLang('')).toBeUndefined();
    expect(normalizeSpeechLang('auto')).toBeUndefined();
    expect(normalizeSpeechLang(' Auto ')).toBeUndefined();

    expect(normalizeSpeechLang('zh')).toBe('zh-CN');
    expect(normalizeSpeechLang('zh-TW')).toBe('zh-TW');
    expect(normalizeSpeechLang('vi')).toBe('vi-VN');
    expect(normalizeSpeechLang('no')).toBe('nb-NO');
    expect(normalizeSpeechLang('en')).toBe('en-US');

    expect(normalizeSpeechLang('en-GB')).toBe('en-GB');
    expect(normalizeSpeechLang('pt-PT')).toBe('pt-PT');

    expect(scoreVoiceForLang('vi-VN', 'vi-VN')).toBeGreaterThan(
      scoreVoiceForLang('vi', 'vi-VN'),
    );
    expect(scoreVoiceForLang('en-US', 'en-US')).toBeGreaterThan(
      scoreVoiceForLang('en-GB', 'en-US'),
    );
    expect(scoreVoiceForLang('en-US', 'vi-VN')).toBe(-1);
  });
});

describe('pickBrowserVoice', () => {
  it('returns null for unusable languages and picks the best matching voice', () => {
    expect(pickBrowserVoice([], 'vi')).toBeNull();
    expect(pickBrowserVoice([voice('vi-VN')], 'auto')).toBeNull();
    expect(pickBrowserVoice([voice('vi-VN')], undefined)).toBeNull();

    const voices = [voice('en-US'), voice('fr-FR')];
    expect(pickBrowserVoice(voices, 'vi')).toBeNull();

    const matchingVoices = [voice('en-US'), voice('vi-VN'), voice('ja-JP')];
    expect(pickBrowserVoice(matchingVoices, 'vi')?.lang).toBe('vi-VN');

    const zhVoices = [voice('zh-CN'), voice('zh-TW'), voice('en-US')];
    expect(pickBrowserVoice(zhVoices, 'zh')?.lang).toBe('zh-CN');
    expect(pickBrowserVoice(zhVoices, 'zh-TW')?.lang).toBe('zh-TW');

    const tied = [
      voice('vi-VN', { name: 'remote', localService: false }),
      voice('vi-VN', { name: 'local', localService: true }),
    ];
    expect(pickBrowserVoice(tied, 'vi')?.name).toBe('local');

    const fallback = [voice('en-GB'), voice('fr-FR')];
    expect(pickBrowserVoice(fallback, 'en')?.lang).toBe('en-GB');
  });
});
