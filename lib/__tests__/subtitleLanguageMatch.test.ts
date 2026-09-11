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

  it('normalizes bare zh to Simplified and zh-TW/HK/MO to Traditional (MAX-38)', () => {
    // The UI uses `zh` for Simplified while Max exposes zh-Hans and zh-Hant as
    // separate tracks: a "Simplified" preference must not pass the gate for a
    // Traditional track just because both primary subtags are `zh`.
    expect(subtitleLanguagesMatch('zh-Hant', 'zh')).toBe(false);
    expect(subtitleLanguagesMatch('zh', 'zh-Hant')).toBe(false);
    expect(subtitleLanguagesMatch('zh-Hans', 'zh')).toBe(true);
    expect(subtitleLanguagesMatch('zh', 'zh-Hans')).toBe(true);
    expect(subtitleLanguagesMatch('zh-Hant', 'zh-TW')).toBe(true);
    expect(subtitleLanguagesMatch('zh-TW', 'zh-Hant')).toBe(true);
    expect(subtitleLanguagesMatch('zh', 'zh-TW')).toBe(false);
    expect(subtitleLanguagesMatch('zh-Hans', 'zh-Hans-SG')).toBe(true);
    expect(subtitleLanguagesMatch('zh-CN', 'zh-Hans')).toBe(true);
  });

  it('keeps ISO 639-2 Chinese conversion working alongside the script default', () => {
    expect(subtitleLanguagesMatch('zho', 'zh-Hans')).toBe(true);
    expect(subtitleLanguagesMatch('zho', 'zh')).toBe(true);
    expect(subtitleLanguagesMatch('zho', 'zh-CN')).toBe(true);
    // ISO 639-2 Chinese is script-neutral in the standard, but this product
    // treats bare zh/zho/chi as Simplified (plan rule), so Traditional tags
    // must not match them.
    expect(subtitleLanguagesMatch('chi', 'zh-TW')).toBe(false);
    expect(subtitleLanguagesMatch('chi', 'zh-Hant')).toBe(false);
    expect(subtitleLanguagesMatch('zho', 'zh-Hant')).toBe(false);
  });
});
