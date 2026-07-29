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

describe('normalizeSpeechLang', () => {
  it('returns undefined for empty and auto', () => {
    expect(normalizeSpeechLang(undefined)).toBeUndefined();
    expect(normalizeSpeechLang('')).toBeUndefined();
    expect(normalizeSpeechLang('auto')).toBeUndefined();
    expect(normalizeSpeechLang(' Auto ')).toBeUndefined();
  });

  it('maps common app codes to BCP-47', () => {
    expect(normalizeSpeechLang('zh')).toBe('zh-CN');
    expect(normalizeSpeechLang('zh-TW')).toBe('zh-TW');
    expect(normalizeSpeechLang('vi')).toBe('vi-VN');
    expect(normalizeSpeechLang('no')).toBe('nb-NO');
    expect(normalizeSpeechLang('en')).toBe('en-US');
  });

  it('preserves region tags', () => {
    expect(normalizeSpeechLang('en-GB')).toBe('en-GB');
    expect(normalizeSpeechLang('pt-PT')).toBe('pt-PT');
  });
});

describe('scoreVoiceForLang', () => {
  it('scores exact higher than primary-only', () => {
    expect(scoreVoiceForLang('vi-VN', 'vi-VN')).toBeGreaterThan(
      scoreVoiceForLang('vi', 'vi-VN'),
    );
    expect(scoreVoiceForLang('en-US', 'en-US')).toBeGreaterThan(
      scoreVoiceForLang('en-GB', 'en-US'),
    );
  });

  it('returns -1 for unrelated languages', () => {
    expect(scoreVoiceForLang('en-US', 'vi-VN')).toBe(-1);
  });
});

describe('pickBrowserVoice', () => {
  it('returns null when no lang or no voices', () => {
    expect(pickBrowserVoice([], 'vi')).toBeNull();
    expect(pickBrowserVoice([voice('vi-VN')], 'auto')).toBeNull();
    expect(pickBrowserVoice([voice('vi-VN')], undefined)).toBeNull();
  });

  it('picks exact lang match', () => {
    const voices = [voice('en-US'), voice('vi-VN'), voice('ja-JP')];
    expect(pickBrowserVoice(voices, 'vi')?.lang).toBe('vi-VN');
  });

  it('picks zh-CN for zh and zh-TW for zh-TW', () => {
    const voices = [voice('zh-CN'), voice('zh-TW'), voice('en-US')];
    expect(pickBrowserVoice(voices, 'zh')?.lang).toBe('zh-CN');
    expect(pickBrowserVoice(voices, 'zh-TW')?.lang).toBe('zh-TW');
  });

  it('prefers localService on tie', () => {
    const voices = [
      voice('vi-VN', { name: 'remote', localService: false }),
      voice('vi-VN', { name: 'local', localService: true }),
    ];
    expect(pickBrowserVoice(voices, 'vi')?.name).toBe('local');
  });

  it('falls back to same primary language', () => {
    const voices = [voice('en-GB'), voice('fr-FR')];
    expect(pickBrowserVoice(voices, 'en')?.lang).toBe('en-GB');
  });

  it('returns null when no language match exists', () => {
    const voices = [voice('en-US'), voice('fr-FR')];
    expect(pickBrowserVoice(voices, 'vi')).toBeNull();
  });
});
