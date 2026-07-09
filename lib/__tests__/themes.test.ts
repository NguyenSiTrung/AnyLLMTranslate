import { describe, it, expect } from 'vitest';
import {
  GENERAL_THEME_OPTIONS,
  getThemeOptionMeta,
  themeOptionsForSelect,
} from '@/lib/themes';

describe('GENERAL_THEME_OPTIONS', () => {
  it('includes the 16 General-tab theme ids (no custom)', () => {
    const ids = GENERAL_THEME_OPTIONS.map((t) => t.id);
    expect(ids).toEqual([
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
  });
});
