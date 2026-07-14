import { describe, it, expect } from 'vitest';
import { buildAppearanceSummaryChips } from '@/lib/subtitlePreviewSummary';

describe('buildAppearanceSummaryChips', () => {
  it('maps position/display/size modes and clamps opacity percent', () => {
    expect(
      buildAppearanceSummaryChips({
        position: 'bottom',
        displayMode: 'bilingual',
        fontSizeMode: 'fixed',
        fontSize: 16,
        backgroundOpacity: 0.5,
      }),
    ).toEqual({
      position: 'Bottom',
      display: 'Bilingual',
      size: '16px',
      opacity: '50%',
    });

    expect(
      buildAppearanceSummaryChips({
        position: 'top',
        displayMode: 'translation-only',
        fontSizeMode: 'auto',
        fontSize: 22,
        backgroundOpacity: 0.33,
      }),
    ).toMatchObject({
      position: 'Top',
      display: 'Translated',
      size: 'Auto',
      opacity: '33%',
    });

    expect(
      buildAppearanceSummaryChips({
        position: 'bottom',
        displayMode: 'bilingual',
        fontSizeMode: 'fixed',
        fontSize: 12,
        backgroundOpacity: 1,
      }).opacity,
    ).toBe('100%');
  });
});
