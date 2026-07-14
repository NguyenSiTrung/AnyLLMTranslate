import { describe, it, expect } from 'vitest';
import { subtitleLanguagesMatch } from '@/lib/subtitleLanguageMatch';

describe('subtitleLanguagesMatch', () => {
  it('matches exact, primary, script, and ISO 639-2 tags; rejects unrelated langs', () => {
    expect(subtitleLanguagesMatch('en-US', 'en-US')).toBe(true);
    expect(subtitleLanguagesMatch('en-US', 'en')).toBe(true);
    expect(subtitleLanguagesMatch('en', 'en-US')).toBe(true);
    expect(subtitleLanguagesMatch('zh-Hans-SG', 'zh-Hans')).toBe(true);
    expect(subtitleLanguagesMatch('zh-Hans', 'zh-Hans-SG')).toBe(true);
    expect(subtitleLanguagesMatch('eng', 'en')).toBe(true);
    expect(subtitleLanguagesMatch('en', 'eng')).toBe(true);
    expect(subtitleLanguagesMatch('eng-US', 'en')).toBe(true);
    expect(subtitleLanguagesMatch('en-US', 'eng')).toBe(true);
    expect(subtitleLanguagesMatch('vie', 'vi')).toBe(true);
    expect(subtitleLanguagesMatch('zho', 'zh-CN')).toBe(true);
    expect(subtitleLanguagesMatch('en-US', 'zh-Hans')).toBe(false);
    expect(subtitleLanguagesMatch('es', 'fr')).toBe(false);
    expect(subtitleLanguagesMatch('eng', 'fra')).toBe(false);
  });
});
