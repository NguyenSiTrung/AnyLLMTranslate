/**
 * Approximate CustomThemeConfig values inspired by a preset.
 * Cannot reproduce bubble tails, gradients, blur masks, etc.
 */

import type { CustomThemeConfig, ThemeName } from '@/types/config';
import { DEFAULT_CUSTOM_THEME } from '@/types/config';

/**
 * Map a display theme preset to custom knobs (colors, border, type only).
 */
export function customThemeFromPreset(preset: ThemeName): CustomThemeConfig {
  if (preset === 'custom') return { ...DEFAULT_CUSTOM_THEME };

  const base: CustomThemeConfig = { ...DEFAULT_CUSTOM_THEME };

  switch (preset) {
    case 'blockquote':
      return {
        ...base,
        textColor: '#6b7280',
        borderStyle: 'solid',
        borderColor: '#3b82f6',
        fontStyle: 'italic',
      };
    case 'paper':
      return {
        ...base,
        textColor: '#b45309',
        backgroundColor: '#fffbeb',
        borderStyle: 'solid',
        borderColor: '#f59e0b',
        fontStyle: 'normal',
      };
    case 'highlight':
      return {
        ...base,
        textColor: '#374151',
        backgroundColor: '#fef08a',
        borderStyle: 'none',
        borderColor: '#eab308',
      };
    case 'italic':
      return { ...base, fontStyle: 'italic', borderStyle: 'none' };
    case 'minimal':
      return {
        ...base,
        textColor: '#9ca3af',
        backgroundColor: 'transparent',
        borderStyle: 'none',
        fontSize: 'smaller',
      };
    case 'dotted-border':
      return { ...base, borderStyle: 'dotted', borderColor: '#6b7280' };
    case 'underline':
      return {
        ...base,
        borderStyle: 'solid',
        borderColor: '#3b82f6',
        backgroundColor: 'transparent',
      };
    case 'dashed-underline':
    case 'wavy-underline':
      return {
        ...base,
        borderStyle: 'dashed',
        borderColor: '#3b82f6',
        backgroundColor: 'transparent',
      };
    default:
      // dividing-line, bubble, side-by-side, mask, fade-in, shadow-card, gradient-accent
      return { ...base };
  }
}
