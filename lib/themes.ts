/**
 * Shared display-theme option metadata for Settings UI.
 * General quick-select uses GENERAL_THEME_OPTIONS (excludes custom gallery-only entry).
 */

import type { ThemeName } from '@/types/config';

export type ThemeOptionMeta = {
  id: ThemeName;
  label: string;
  description?: string;
};

/** Theme options shown on General tab quick-select (matches historical THEME_OPTIONS). */
export const GENERAL_THEME_OPTIONS: ThemeOptionMeta[] = [
  { id: 'dividing-line', label: 'Dividing Line', description: 'Classic separator' },
  { id: 'blockquote', label: 'Blockquote', description: 'Left accent bar' },
  { id: 'paper', label: 'Paper Note', description: 'Warm background' },
  { id: 'underline', label: 'Underline', description: 'Bottom accent' },
  { id: 'dashed-underline', label: 'Dashed Underline', description: 'Dashed bottom' },
  { id: 'highlight', label: 'Highlight', description: 'Marker effect' },
  { id: 'wavy-underline', label: 'Wavy Underline', description: 'Wavy decoration' },
  { id: 'bubble', label: 'Speech Bubble', description: 'Tooltip style' },
  { id: 'side-by-side', label: 'Side by Side', description: 'Column layout' },
  { id: 'mask', label: 'Blur Mask', description: 'Hover to reveal' },
  { id: 'fade-in', label: 'Fade In', description: 'Delayed appear' },
  { id: 'italic', label: 'Italic', description: 'Simple italic' },
  { id: 'dotted-border', label: 'Dotted Border', description: 'Dotted frame' },
  { id: 'shadow-card', label: 'Shadow Card', description: 'Elevated card' },
  { id: 'minimal', label: 'Minimal', description: 'Subtle text' },
  { id: 'gradient-accent', label: 'Gradient Accent', description: 'Gradient bg' },
];

export function getThemeOptionMeta(id: ThemeName): ThemeOptionMeta | undefined {
  return GENERAL_THEME_OPTIONS.find((t) => t.id === id);
}

export function themeOptionsForSelect(): { value: string; label: string }[] {
  return GENERAL_THEME_OPTIONS.map((t) => ({ value: t.id, label: t.label }));
}
