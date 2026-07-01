import type { SubtitleCue } from '@/types/subtitle';

/** Look-back window (seconds) so the active cue is treated as near-current. */
const ACTIVE_CUE_LOOKBACK_SEC = 1;

/** Large offset so past cues sort after all current/future cues. */
const PAST_CUE_RANK_OFFSET = 1_000_000;

/**
 * Remove texts that were queued for translation but never landed in the map.
 * Called after cancelling an in-flight session (e.g. video seek) so those
 * texts can be re-sent on the next segment.
 */
export function reconcilePendingTranslatedTexts(
  pending: Set<string>,
  translated: Map<string, string>,
): void {
  for (const text of pending) {
    if (!translated.has(text)) {
      pending.delete(text);
    }
  }
}

/**
 * Sort cue texts so translation starts at the current playback position and
 * proceeds forward. Past cues in the same VTT segment are deprioritized.
 */
export function sortCueTextsByPlaybackPriority(
  texts: string[],
  cues: SubtitleCue[],
  currentTime: number,
): string[] {
  if (texts.length <= 1) return texts;

  const earliestStartByText = new Map<string, number>();
  for (const cue of cues) {
    const prev = earliestStartByText.get(cue.text);
    if (prev === undefined || cue.startTime < prev) {
      earliestStartByText.set(cue.text, cue.startTime);
    }
  }

  const rank = (text: string): number => {
    const start = earliestStartByText.get(text);
    if (start === undefined) return Number.POSITIVE_INFINITY;
    if (start >= currentTime - ACTIVE_CUE_LOOKBACK_SEC) return start;
    return PAST_CUE_RANK_OFFSET + start;
  };

  return [...texts].sort((a, b) => rank(a) - rank(b));
}