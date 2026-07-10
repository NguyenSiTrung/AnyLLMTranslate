import { describe, it, expect } from 'vitest';
import { customThemeFromPreset } from '@/lib/customThemePresets';
import { DEFAULT_CUSTOM_THEME } from '@/types/config';

describe('customThemeFromPreset', () => {
  it('returns defaults for custom id', () => {
    expect(customThemeFromPreset('custom')).toEqual(DEFAULT_CUSTOM_THEME);
  });

  it('maps paper to warm colors and solid border', () => {
    const c = customThemeFromPreset('paper');
    expect(c.backgroundColor).not.toBe('transparent');
    expect(c.borderStyle).toBe('solid');
  });

  it('maps italic fontStyle', () => {
    expect(customThemeFromPreset('italic').fontStyle).toBe('italic');
  });

  it('maps highlight to none border and yellow-ish bg', () => {
    const c = customThemeFromPreset('highlight');
    expect(c.borderStyle).toBe('none');
    expect(c.backgroundColor).toMatch(/#|rgb|yellow|fef0/i);
  });

  it('returns a full CustomThemeConfig for layout-style presets', () => {
    const c = customThemeFromPreset('bubble');
    expect(c).toMatchObject({
      textColor: expect.any(String),
      backgroundColor: expect.any(String),
      borderStyle: expect.any(String),
      borderColor: expect.any(String),
      fontStyle: expect.any(String),
      fontSize: expect.any(String),
    });
  });
});
