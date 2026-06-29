import { describe, it, expect } from 'vitest';
import { subtitleLanguagesMatch } from '@/lib/subtitleLanguageMatch';

describe('subtitleLanguagesMatch', () => {
  it('matches exact tags', () => {
    expect(subtitleLanguagesMatch('en-US', 'en-US')).toBe(true);
  });

  it('matches primary subtags', () => {
    expect(subtitleLanguagesMatch('en-US', 'en')).toBe(true);
    expect(subtitleLanguagesMatch('en', 'en-US')).toBe(true);
  });

  it('matches script variants used by Max MPD', () => {
    expect(subtitleLanguagesMatch('zh-Hans-SG', 'zh-Hans')).toBe(true);
    expect(subtitleLanguagesMatch('zh-Hans', 'zh-Hans-SG')).toBe(true);
  });

  it('rejects unrelated languages', () => {
    expect(subtitleLanguagesMatch('en-US', 'zh-Hans')).toBe(false);
    expect(subtitleLanguagesMatch('es', 'fr')).toBe(false);
  });
});