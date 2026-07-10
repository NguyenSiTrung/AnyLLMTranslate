/**
 * Shared display-theme registry for Settings UI (General + Theme Studio).
 * GENERAL_THEME_OPTIONS excludes custom (gallery / Theme Studio only).
 */

import type { ThemeName } from '@/types/config';

export type ThemeCategory = 'classic' | 'accent' | 'layout' | 'interactive' | 'custom';

export interface ThemeDefinition {
  id: ThemeName;
  label: string;
  description: string;
  category: ThemeCategory;
  /** Short studio helper shown under the canvas */
  tip?: string;
}

/** Full registry — every ThemeName exactly once. */
export const THEME_DEFINITIONS: ThemeDefinition[] = [
  { id: 'dividing-line', label: 'Dividing Line', description: 'Classic separator', category: 'classic' },
  { id: 'blockquote', label: 'Blockquote', description: 'Left accent bar', category: 'classic' },
  { id: 'paper', label: 'Paper Note', description: 'Warm background', category: 'classic' },
  { id: 'underline', label: 'Underline', description: 'Bottom accent', category: 'classic' },
  { id: 'italic', label: 'Italic', description: 'Simple italic', category: 'classic' },
  { id: 'minimal', label: 'Minimal', description: 'Subtle text', category: 'classic' },
  { id: 'dashed-underline', label: 'Dashed Underline', description: 'Dashed bottom', category: 'accent' },
  { id: 'highlight', label: 'Highlight', description: 'Marker effect', category: 'accent' },
  { id: 'wavy-underline', label: 'Wavy Underline', description: 'Wavy decoration', category: 'accent' },
  { id: 'dotted-border', label: 'Dotted Border', description: 'Dotted frame', category: 'accent' },
  { id: 'gradient-accent', label: 'Gradient Accent', description: 'Gradient bg', category: 'accent' },
  {
    id: 'side-by-side',
    label: 'Side by Side',
    description: 'Column layout',
    category: 'layout',
    tip: 'Original and translation share a row when space allows.',
  },
  {
    id: 'bubble',
    label: 'Speech Bubble',
    description: 'Tooltip style',
    category: 'layout',
    tip: 'Translation appears in a speech-bubble style callout.',
  },
  { id: 'shadow-card', label: 'Shadow Card', description: 'Elevated card', category: 'layout' },
  {
    id: 'mask',
    label: 'Blur Mask',
    description: 'Hover to reveal',
    category: 'interactive',
    tip: 'Hover or focus the translation to reveal it.',
  },
  {
    id: 'fade-in',
    label: 'Fade In',
    description: 'Delayed appear',
    category: 'interactive',
    tip: 'Translation eases in after a short delay.',
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Design your own',
    category: 'custom',
    tip: 'Tune colors, border, and type below. Other presets may use effects custom cannot fully copy.',
  },
];

/** Theme options shown on General tab quick-select (excludes custom). */
export const GENERAL_THEME_OPTIONS: ThemeDefinition[] = THEME_DEFINITIONS.filter(
  (t) => t.id !== 'custom',
);

/** @deprecated Prefer ThemeDefinition — kept for type aliases in older call sites */
export type ThemeOptionMeta = ThemeDefinition;

export function getThemeDefinition(id: ThemeName): ThemeDefinition | undefined {
  return THEME_DEFINITIONS.find((t) => t.id === id);
}

export function getThemeOptionMeta(id: ThemeName): ThemeDefinition | undefined {
  return getThemeDefinition(id);
}

export function themeOptionsForSelect(): { value: string; label: string }[] {
  return GENERAL_THEME_OPTIONS.map((t) => ({ value: t.id, label: t.label }));
}

export function themesByCategory(category: ThemeCategory | 'all'): ThemeDefinition[] {
  if (category === 'all') return THEME_DEFINITIONS;
  return THEME_DEFINITIONS.filter((t) => t.category === category);
}
