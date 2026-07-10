import { describe, it, expect } from 'vitest';
import { buildAppearanceSummaryChips } from '@/lib/subtitlePreviewSummary';

describe('buildAppearanceSummaryChips', () => {
  it('maps fixed size and bilingual bottom', () => {
    const chips = buildAppearanceSummaryChips({
      position: 'bottom',
      displayMode: 'bilingual',
      fontSizeMode: 'fixed',
      fontSize: 16,
      backgroundOpacity: 0.5,
    });
    expect(chips).toEqual({
      position: 'Bottom',
      display: 'Bilingual',
      size: '16px',
      opacity: '50%',
    });
  });

  it('maps top, translated-only, auto size, rounded opacity', () => {
    const chips = buildAppearanceSummaryChips({
      position: 'top',
      displayMode: 'translation-only',
      fontSizeMode: 'auto',
      fontSize: 22,
      backgroundOpacity: 0.33,
    });
    expect(chips.position).toBe('Top');
    expect(chips.display).toBe('Translated');
    expect(chips.size).toBe('Auto');
    expect(chips.opacity).toBe('33%');
  });

  it('clamps opacity percent to 0–100 integer', () => {
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
