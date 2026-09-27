/**
 * Plus-mode decision helpers — PURE module (no I/O, no DOM).
 *
 * Plus is an opt-in whole-track mode for sources that hand over the complete
 * track at activation. Everything here is a pure decision so it can be tested
 * without a browser: mode resolution, eligibility, and the one-time hint.
 *
 * See docs/superpowers/specs/2026-09-27-subtitle-plus-mode-design.md.
 */

import type { SubtitleTranslationMode } from '@/types/config';

/** Effective mode: per-session override > settings value > 'progressive'. */
export function resolveSubtitleTranslationMode(
  settingsMode: SubtitleTranslationMode | undefined,
  override: SubtitleTranslationMode | undefined,
): SubtitleTranslationMode {
  return override ?? settingsMode ?? 'progressive';
}