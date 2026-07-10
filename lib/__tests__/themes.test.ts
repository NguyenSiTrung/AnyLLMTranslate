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

describe('THEME_DEFINITIONS', () => {
  it('includes every ThemeName exactly once', () => {
    const ids = THEME_DEFINITIONS.map((t) => t.id);
    expect(ids.sort()).toEqual([...ALL_THEME_NAMES].sort());
    expect(new Set(ids).size).toBe(ALL_THEME_NAMES.length);
  });

  it('assigns categories per design spec', () => {
    const byId = Object.fromEntries(THEME_DEFINITIONS.map((t) => [t.id, t.category]));
    expect(byId['blockquote']).toBe('classic');
    expect(byId['highlight']).toBe('accent');
    expect(byId['side-by-side']).toBe('layout');
    expect(byId['mask']).toBe('interactive');
    expect(byId['custom']).toBe('custom');
  });

  it('provides tips for interactive and custom themes', () => {
    expect(getThemeDefinition('mask')?.tip).toMatch(/hover|focus/i);
    expect(getThemeDefinition('fade-in')?.tip).toBeTruthy();
    expect(getThemeDefinition('custom')?.tip).toBeTruthy();
  });
});

describe('GENERAL_THEME_OPTIONS / select', () => {
  it('includes the 16 General-tab theme ids (no custom)', () => {
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
  });

  it('has unique labels for every option', () => {
    const labels = GENERAL_THEME_OPTIONS.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('getThemeOptionMeta returns metadata for known ids', () => {
    expect(getThemeOptionMeta('bubble')).toEqual(
      expect.objectContaining({ id: 'bubble', label: 'Speech Bubble' }),
    );
  });

  it('themeOptionsForSelect maps to Select-compatible shape', () => {
    const opts = themeOptionsForSelect();
    expect(opts[0]).toEqual({ value: 'dividing-line', label: 'Dividing Line' });
    expect(opts).toHaveLength(16);
    expect(opts.some((o) => o.value === 'custom')).toBe(false);
  });
});

describe('themesByCategory', () => {
  it('returns all for all', () => {
    expect(themesByCategory('all')).toHaveLength(17);
  });

  it('filters classic', () => {
    const ids = themesByCategory('classic').map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'dividing-line',
        'blockquote',
        'paper',
        'underline',
        'italic',
        'minimal',
      ]),
    );
    expect(ids).toHaveLength(6);
  });
});
