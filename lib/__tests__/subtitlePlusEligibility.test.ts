import { describe, expect, it } from 'vitest';
import { DEFAULT_SUBTITLE_SETTINGS, type SubtitleTranslationMode } from '@/types/config';
import { resolveSubtitleTranslationMode } from '@/lib/subtitlePlusEligibility';
import {
  PLUS_HINT_MIN_CUES,
  PLUS_MIN_CUES,
  resolvePlusEligibility,
  shouldOfferPlusHint,
} from '@/lib/subtitlePlusEligibility';
import { SUBTITLE_CHUNK_SIZE } from '@/lib/constants';

describe('subtitle plus mode resolution', () => {
  it('defaults to progressive', () => {
    expect(DEFAULT_SUBTITLE_SETTINGS.translationMode).toBe('progressive');
    expect(DEFAULT_SUBTITLE_SETTINGS.plusHintDismissed).toBeUndefined();
  });

  it('treats an absent settings value as progressive', () => {
    expect(resolveSubtitleTranslationMode(undefined, undefined)).toBe('progressive');
  });

  it('lets the per-session override win over the settings value', () => {
    expect(resolveSubtitleTranslationMode('progressive', 'plus')).toBe('plus');
    expect(resolveSubtitleTranslationMode('plus', 'progressive')).toBe('progressive');
  });

  it('uses the settings value when no override is active', () => {
    const mode: SubtitleTranslationMode = 'plus';
    expect(resolveSubtitleTranslationMode(mode, undefined)).toBe('plus');
  });
});

describe('resolvePlusEligibility', () => {
  it('requires the plus mode, a declared complete track, and enough cues', () => {
    expect(
      resolvePlusEligibility({
        translationMode: 'plus',
        completeTrack: true,
        cueCount: PLUS_MIN_CUES,
      }),
    ).toBe(true);
  });

  it('rejects the progressive mode and the absent mode', () => {
    expect(
      resolvePlusEligibility({
        translationMode: 'progressive',
        completeTrack: true,
        cueCount: 500,
      }),
    ).toBe(false);
    expect(resolvePlusEligibility({ completeTrack: true, cueCount: 500 })).toBe(false);
  });

  it('rejects a caller that did not declare a complete track', () => {
    expect(resolvePlusEligibility({ translationMode: 'plus', cueCount: 500 })).toBe(false);
  });

  it('rejects delta-shaped requests', () => {
    expect(
      resolvePlusEligibility({
        translationMode: 'plus',
        completeTrack: true,
        skipFilmPreScan: true,
        cueCount: 500,
      }),
    ).toBe(false);
  });

  it('rejects a track shorter than two chunks', () => {
    expect(
      resolvePlusEligibility({
        translationMode: 'plus',
        completeTrack: true,
        cueCount: PLUS_MIN_CUES - 1,
      }),
    ).toBe(false);
    expect(PLUS_MIN_CUES).toBe(2 * SUBTITLE_CHUNK_SIZE);
  });
});

describe('shouldOfferPlusHint', () => {
  it('is false below the threshold and when dismissed', () => {
    expect(shouldOfferPlusHint(PLUS_HINT_MIN_CUES - 1, undefined)).toBe(false);
    expect(shouldOfferPlusHint(PLUS_HINT_MIN_CUES, true)).toBe(false);
  });

  it('is true at or above the threshold when not dismissed', () => {
    expect(shouldOfferPlusHint(PLUS_HINT_MIN_CUES, undefined)).toBe(true);
    expect(shouldOfferPlusHint(PLUS_HINT_MIN_CUES + 500, false)).toBe(true);
  });
});
