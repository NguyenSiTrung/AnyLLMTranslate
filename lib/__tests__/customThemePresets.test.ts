import { describe, it, expect } from 'vitest';
import { customThemeFromPreset } from '@/lib/customThemePresets';
import { DEFAULT_CUSTOM_THEME } from '@/types/config';

describe('customThemeFromPreset', () => {
  it('maps known presets and returns full CustomThemeConfig shapes', () => {
    expect(customThemeFromPreset('custom')).toEqual(DEFAULT_CUSTOM_THEME);

    const paper = customThemeFromPreset('paper');
    expect(paper.backgroundColor).not.toBe('transparent');
    expect(paper.borderStyle).toBe('solid');

    expect(customThemeFromPreset('italic').fontStyle).toBe('italic');

    const highlight = customThemeFromPreset('highlight');
    expect(highlight.borderStyle).toBe('none');
    expect(highlight.backgroundColor).toMatch(/#|rgb|yellow|fef0/i);

    const bubble = customThemeFromPreset('bubble');
    expect(bubble).toMatchObject({
      textColor: expect.any(String),
      backgroundColor: expect.any(String),
      borderStyle: expect.any(String),
      borderColor: expect.any(String),
      fontStyle: expect.any(String),
      fontSize: expect.any(String),
    });
  });
});
