import { describe, it, expect } from 'vitest';
import type { ThemeName } from '@/types/config';
import {
  THEME_DEFINITIONS,
  GENERAL_THEME_OPTIONS,
  getThemeDefinition,
  getThemeOptionMeta,
  themeOptionsForSelect,
  themesByCategory,
} from '@/lib/themes';

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

describe('themes catalog', () => {
  it('covers every ThemeName with unique labels, categories, and tips', () => {
    const ids = THEME_DEFINITIONS.map((t) => t.id);
    expect(ids.sort()).toEqual([...ALL_THEME_NAMES].sort());
    expect(new Set(ids).size).toBe(ALL_THEME_NAMES.length);

    const byId = Object.fromEntries(THEME_DEFINITIONS.map((t) => [t.id, t.category]));
    expect(byId['blockquote']).toBe('classic');
    expect(byId['highlight']).toBe('accent');
    expect(byId['side-by-side']).toBe('layout');
    expect(byId['mask']).toBe('interactive');
    expect(byId['custom']).toBe('custom');

    expect(getThemeDefinition('mask')?.tip).toMatch(/hover|focus/i);
    expect(getThemeDefinition('fade-in')?.tip).toBeTruthy();
    expect(getThemeDefinition('custom')?.tip).toBeTruthy();

    const labels = GENERAL_THEME_OPTIONS.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('exposes General-tab options and Select-compatible shapes without custom', () => {
    const ids = GENERAL_THEME_OPTIONS.map((t) => t.id);
    expect(ids).toEqual([
      'dividing-line',
      'blockquote',
      'paper',
      'underline',
      'italic',
      'minimal',
      'dashed-underline',
      'highlight',
      'wavy-underline',
      'dotted-border',
      'gradient-accent',
      'side-by-side',
      'bubble',
      'shadow-card',
      'mask',
      'fade-in',
    ]);
    expect(ids).not.toContain('custom');
    expect(getThemeOptionMeta('bubble')).toEqual(
      expect.objectContaining({ id: 'bubble', label: 'Speech Bubble' }),
    );
    const opts = themeOptionsForSelect();
    expect(opts[0]).toEqual({ value: 'dividing-line', label: 'Dividing Line' });
    expect(opts).toHaveLength(16);
    expect(opts.some((o) => o.value === 'custom')).toBe(false);
  });

  it('filters by category', () => {
    expect(themesByCategory('all')).toHaveLength(17);
    const classic = themesByCategory('classic').map((t) => t.id);
    expect(classic).toEqual(
      expect.arrayContaining([
        'dividing-line',
        'blockquote',
        'paper',
        'underline',
        'italic',
        'minimal',
      ]),
    );
    expect(classic).toHaveLength(6);
  });
});
