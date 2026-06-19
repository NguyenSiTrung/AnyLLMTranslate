/**
 * Tests for lib/subtitleSites.ts — SUPPORTED_SUBTITLE_SITES and isSiteDisabled utility.
 */

import { describe, it, expect } from 'vitest';
import { SUPPORTED_SUBTITLE_SITES, isSiteDisabled } from '@/lib/subtitleSites';
import { DEFAULT_SUBTITLE_SETTINGS } from '@/types/config';

describe('SUPPORTED_SUBTITLE_SITES', () => {
  it('contains exactly 5 platforms', () => {
    expect(SUPPORTED_SUBTITLE_SITES).toHaveLength(5);
  });

  it('includes youtube, udemy, coursera, linkedin, hbomax', () => {
    const platforms = SUPPORTED_SUBTITLE_SITES.map((s) => s.platform);
    expect(platforms).toEqual(['youtube', 'udemy', 'coursera', 'linkedin', 'hbomax']);
  });

  it('each entry has platform, name, and methodHint', () => {
    for (const site of SUPPORTED_SUBTITLE_SITES) {
      expect(site.platform).toBeTruthy();
      expect(site.name).toBeTruthy();
      expect(site.methodHint).toBeTruthy();
    }
  });
});

describe('isSiteDisabled', () => {
  it('returns false when disabled list is empty', () => {
    expect(isSiteDisabled('youtube', [])).toBe(false);
  });

  it('returns true when platform is in the disabled list', () => {
    expect(isSiteDisabled('youtube', ['youtube', 'udemy'])).toBe(true);
  });

  it('returns false when platform is not in the disabled list', () => {
    expect(isSiteDisabled('coursera', ['youtube', 'udemy'])).toBe(false);
  });

  it('returns false for unknown platform not in the disabled list', () => {
    expect(isSiteDisabled('netflix', ['youtube'])).toBe(false);
  });

  it('returns true for unknown platform that is in the disabled list', () => {
    expect(isSiteDisabled('netflix', ['netflix'])).toBe(true);
  });
});

describe('DEFAULT_SUBTITLE_SETTINGS.disabledSubtitleSites', () => {
  it('defaults to an empty array', () => {
    expect(DEFAULT_SUBTITLE_SETTINGS.disabledSubtitleSites).toEqual([]);
  });
});
