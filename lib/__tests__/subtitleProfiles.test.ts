/**
 * Tests for subtitle profile data + resolver.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveProfile,
  PROFILE_PRESETS,
  DOMAIN_PROFILE_MAP,
  type SubtitleProfile,
} from '@/lib/subtitleProfiles';

describe('resolveProfile', () => {
  it('returns educational for udemy.com', () => {
    expect(resolveProfile('udemy.com')).toBe('educational');
  });

  it('returns educational for coursera.org', () => {
    expect(resolveProfile('coursera.org')).toBe('educational');
  });

  it('returns educational for linkedin.com', () => {
    expect(resolveProfile('linkedin.com')).toBe('educational');
  });

  it('returns media for youtube.com', () => {
    expect(resolveProfile('youtube.com')).toBe('media');
  });

  it('returns cinematic for max.com', () => {
    expect(resolveProfile('max.com')).toBe('cinematic');
  });

  it('returns cinematic for hbomax.com', () => {
    expect(resolveProfile('hbomax.com')).toBe('cinematic');
  });

  it('falls back to media for an unmapped domain', () => {
    expect(resolveProfile('example.org')).toBe('media');
  });

  it('falls back to media for the empty string', () => {
    expect(resolveProfile('')).toBe('media');
  });
});

describe('PROFILE_PRESETS', () => {
  const ALL_PROFILES: SubtitleProfile[] = ['educational', 'media', 'cinematic'];

  it('has an entry for every profile', () => {
    for (const p of ALL_PROFILES) {
      expect(PROFILE_PRESETS[p]).toBeDefined();
    }
  });

  it('educational preset is literal-leaning', () => {
    expect(PROFILE_PRESETS.educational).toEqual({
      register: 'neutral',
      faithfulness: 'literal',
      brevity: 'relaxed',
      profanity: 'preserve',
    });
  });

  it('media preset is balanced defaults', () => {
    expect(PROFILE_PRESETS.media).toEqual({
      register: 'neutral',
      faithfulness: 'balanced',
      brevity: 'moderate',
      profanity: 'preserve',
    });
  });

  it('cinematic preset is casual + idiomatic', () => {
    expect(PROFILE_PRESETS.cinematic).toEqual({
      register: 'casual',
      faithfulness: 'idiomatic',
      brevity: 'moderate',
      profanity: 'preserve',
    });
  });
});

describe('DOMAIN_PROFILE_MAP', () => {
  it('keys are hostnames without scheme/path', () => {
    for (const key of Object.keys(DOMAIN_PROFILE_MAP)) {
      expect(key).not.toContain('/');
      expect(key).not.toContain(':');
    }
  });
});
