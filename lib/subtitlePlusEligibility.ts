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
import { SUBTITLE_CHUNK_SIZE } from '@/lib/constants';

/** Effective mode: per-session override > settings value > 'progressive'. */
export function resolveSubtitleTranslationMode(
  settingsMode: SubtitleTranslationMode | undefined,
  override: SubtitleTranslationMode | undefined,
): SubtitleTranslationMode {
  return override ?? settingsMode ?? 'progressive';
}

/** Minimum cue count for a Plus run: below two chunks there is nothing to
 *  parallelize and the frozen glossary cannot pay for its own latency. */
export const PLUS_MIN_CUES = 2 * SUBTITLE_CHUNK_SIZE;

/** Minimum cue count before offering the mode at all (~200 cues ≈ 7 minutes
 *  of dialogue). Short videos gain nothing and should not be prompted. */
export const PLUS_HINT_MIN_CUES = 200;

/** Why a Plus request did not run as Plus. Surfaced to the user, never silent. */
export type PlusDowngradeReason = 'ineligible' | 'empty-prep' | 'prep-failed';

export interface PlusEligibilityInput {
  translationMode?: SubtitleTranslationMode;
  completeTrack?: boolean;
  /** Set by the manifest/DOM/MSE delta paths. A delta request is never a
   *  complete track, even if a caller mislabels it. */
  skipFilmPreScan?: boolean;
  cueCount: number;
}

/** True when a request may start a Plus run. The background re-validates this
 *  rather than trusting the caller's mode field. */
export function resolvePlusEligibility(input: PlusEligibilityInput): boolean {
  return (
    input.translationMode === 'plus' &&
    input.completeTrack === true &&
    input.skipFilmPreScan !== true &&
    input.cueCount >= PLUS_MIN_CUES
  );
}

/** True when the one-time discoverability hint should be shown. */
export function shouldOfferPlusHint(cueCount: number, dismissed: boolean | undefined): boolean {
  return dismissed !== true && cueCount >= PLUS_HINT_MIN_CUES;
}
