import { describe, it, expect } from 'vitest';
import type { ThemeName } from '@/types/config';
import {
  THEME_DEFINITIONS,
  getThemeDefinition,
  themeOptionsForSelect,
  themesByCategory,
} from '@/lib/themes';
import { customThemeFromPreset } from '@/lib/customThemePresets';
import { DEFAULT_CUSTOM_THEME } from '@/types/config';

const ALL_THEME_NAMES: ThemeName[] = [
  'dividing-line',
  'blockquote',
  'paper',
  'underline',
  'dashed-underline',
  'highlight',
  'wavy-underline',
  'bubble',
  'side-by-side',
  'mask',
  'fade-in',
  'italic',
  'dotted-border',
  'shadow-card',
  'minimal',
  'gradient-accent',
  'custom',
];

describe('themes catalog and custom preset mappings', () => {
  it('covers ThemeName catalog, General-tab options, Select shapes, category filters, and custom presets', () => {
    const ids = THEME_DEFINITIONS.map((t) => t.id);
    expect(ids.sort()).toEqual([...ALL_THEME_NAMES].sort());
    expect(new Set(ids).size).toBe(ALL_THEME_NAMES.length);

    expect(getThemeDefinition('mask')?.tip).toMatch(/hover|focus/i);
    expect(themeOptionsForSelect()).toHaveLength(16);
    expect(themesByCategory('all')).toHaveLength(17);

    // Presets
    expect(customThemeFromPreset('custom')).toEqual(DEFAULT_CUSTOM_THEME);
    const paper = customThemeFromPreset('paper');
    expect(paper.backgroundColor).not.toBe('transparent');
    expect(customThemeFromPreset('italic').fontStyle).toBe('italic');
  });
});
