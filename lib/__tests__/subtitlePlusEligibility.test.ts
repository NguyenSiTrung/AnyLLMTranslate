import { describe, expect, it } from 'vitest';
import { DEFAULT_SUBTITLE_SETTINGS, type SubtitleTranslationMode } from '@/types/config';
import { resolveSubtitleTranslationMode } from '@/lib/subtitlePlusEligibility';

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