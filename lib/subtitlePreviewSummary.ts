/**
 * Pure appearance summary chips for the Subtitle Studio live preview.
 * Spec: docs/superpowers/specs/2026-07-10-subtitle-studio-design.md
 */

import type {
  SubtitleDisplayMode,
  SubtitleFontSizeMode,
} from '@/types/config';

export interface SubtitleAppearanceSummaryInput {
  position: 'bottom' | 'top';
  displayMode: SubtitleDisplayMode;
  fontSizeMode: SubtitleFontSizeMode;
  fontSize: number;
  backgroundOpacity: number;
}

export interface SubtitleAppearanceSummaryChips {
  position: string;
  display: string;
  size: string;
  opacity: string;
}

/** Map Appearance settings to short scannable chip labels. */
export function buildAppearanceSummaryChips(
  input: SubtitleAppearanceSummaryInput,
): SubtitleAppearanceSummaryChips {
  const pct = Math.round(Math.min(1, Math.max(0, input.backgroundOpacity)) * 100);
  return {
    position: input.position === 'top' ? 'Top' : 'Bottom',
    display: input.displayMode === 'bilingual' ? 'Bilingual' : 'Translated',
    size: input.fontSizeMode === 'auto' ? 'Auto' : `${input.fontSize}px`,
    opacity: `${pct}%`,
  };
}
