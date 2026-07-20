import type { ThemeName } from '@/types/config';

export const TYPOGRAPHY = {
  label: 'text-[11px] uppercase tracking-wider text-zinc-500 font-semibold',
  body: 'text-xs text-zinc-300',
  small: 'text-[11px] text-zinc-400',
  tiny: 'text-[10px] text-zinc-500',
} as const;

export const SPACING = {
  xs: 'space-y-1',
  sm: 'space-y-2',
  md: 'space-y-3',
  lg: 'space-y-4',
} as const;

export const THEME_LABELS: Record<ThemeName, string> = {
  'dividing-line': 'Dividing Line',
  blockquote: 'Blockquote',
  paper: 'Paper',
  underline: 'Underline',
  'dashed-underline': 'Dashed',
  highlight: 'Highlight',
  'wavy-underline': 'Wavy',
  bubble: 'Bubble',
  'side-by-side': 'Side by Side',
  mask: 'Mask',
  'fade-in': 'Fade In',
  italic: 'Italic',
  'dotted-border': 'Dotted',
  'shadow-card': 'Card',
  minimal: 'Minimal',
  'gradient-accent': 'Gradient',
  custom: 'Custom',
};
