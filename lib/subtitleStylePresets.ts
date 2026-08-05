/**
 * Subtitle style presets — named looks for the on-player subtitle overlay.
 * Pure module: no DOM, no chrome APIs, trivially unit-testable.
 *
 * A preset defines the base look; optional user overrides merge per-field and
 * any non-empty override switches the effective style to "Custom" (the UI
 * derives this from Object.keys(styleOverrides).length). The global
 * background-opacity knob is the box alpha for box styles and is forced to 0
 * for shadow-only ('none') styles.
 */

import type {
  SubtitleFontFamily,
  SubtitleStyleOverrides,
  SubtitleStylePresetId,
} from '@/types/config';

/** Fully resolved style bundle consumed by the overlay and previews. */
export interface ResolvedSubtitleStyle {
  /** Full CSS color for the translated line, e.g. 'rgba(255,255,255,1)'. */
  textColor: string;
  /** Full CSS color for the original line (preset-defined or derived at 60% alpha). */
  originalTextColor: string;
  /** Box background as an rgb triplet, e.g. '0,0,0'. */
  backgroundColor: string;
  /** Box alpha 0–1; 0 when the style has no box. */
  backgroundOpacity: number;
  /** Box corner radius in px. */
  borderRadius: number;
  /** CSS text-shadow value; 'none' disables the shadow. */
  textShadow: string;
}

interface SubtitleStylePreset {
  label: string;
  textColor: string;
  /** Explicit original-line color; absent = derived at 60% alpha of textColor. */
  originalTextColor?: string;
  backgroundStyle: 'none' | 'black-box' | 'white-box';
  shadowStrength: number;
  borderRadius: number;
}

/** The five approved presets. 'classic' reproduces the pre-preset look exactly. */
export const SUBTITLE_STYLE_PRESETS: Record<SubtitleStylePresetId, SubtitleStylePreset> = {
  classic: {
    label: 'Classic',
    textColor: '#ffffff',
    originalTextColor: 'rgba(255,255,255,0.6)',
    backgroundStyle: 'black-box',
    shadowStrength: 0.5,
    borderRadius: 8,
  },
  netflix: {
    label: 'Netflix',
    textColor: '#ffffff',
    backgroundStyle: 'none',
    shadowStrength: 0.8,
    borderRadius: 8,
  },
  'white-on-black': {
    label: 'White on black',
    textColor: '#ffffff',
    backgroundStyle: 'black-box',
    shadowStrength: 0.3,
    borderRadius: 4,
  },
  'yellow-on-black': {
    label: 'Yellow on black',
    textColor: '#f5c518',
    backgroundStyle: 'black-box',
    shadowStrength: 0.3,
    borderRadius: 4,
  },
  'black-on-white': {
    label: 'Black on white',
    textColor: '#000000',
    backgroundStyle: 'white-box',
    shadowStrength: 0,
    borderRadius: 4,
  },
};

/** Convert a hex color to rgba at the given alpha. Non-hex input passes through. */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (full.length !== 6) return color;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Resolve a preset + overrides + the global background-opacity knob into the
 * concrete style bundle the overlay renders. Unknown preset ids fall back to
 * classic. Shadow alpha equals shadowStrength (classic 0.5 → the historic
 * '0 1px 3px rgba(0,0,0,0.5)' value).
 */
export function resolveSubtitleStyle(
  presetId: SubtitleStylePresetId,
  overrides: Partial<SubtitleStyleOverrides> | undefined,
  backgroundOpacity: number,
): ResolvedSubtitleStyle {
  const preset = SUBTITLE_STYLE_PRESETS[presetId] ?? SUBTITLE_STYLE_PRESETS.classic;
  const backgroundStyle = overrides?.backgroundStyle ?? preset.backgroundStyle;
  const textColor = overrides?.textColor ?? preset.textColor;
  const shadowStrength = overrides?.shadowStrength ?? preset.shadowStrength;
  return {
    textColor: withAlpha(textColor, 1),
    originalTextColor: preset.originalTextColor ?? withAlpha(textColor, 0.6),
    backgroundColor: backgroundStyle === 'white-box' ? '255,255,255' : '0,0,0',
    backgroundOpacity: backgroundStyle === 'none' ? 0 : backgroundOpacity,
    borderRadius: preset.borderRadius,
    textShadow:
      shadowStrength > 0
        ? `0 1px 3px rgba(0,0,0,${Math.round(shadowStrength * 100) / 100})`
        : 'none',
  };
}

/** Single source of truth for the subtitle font-family setting → CSS stack. */
export function resolveSubtitleFontFamily(fontFamily: SubtitleFontFamily | undefined): string {
  const map: Record<SubtitleFontFamily, string> = {
    serif: 'Georgia, serif',
    monospace: 'monospace',
    system: 'system-ui, sans-serif',
  };
  return map[fontFamily ?? 'system'] ?? 'system-ui, sans-serif';
}
