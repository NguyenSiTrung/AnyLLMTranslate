/**
 * Subtitle reading-speed & timing adaptation — PURE module.
 *
 * The bilingual overlay shows two lines per cue (original + translation), so a
 * readable duration must account for reading BOTH texts. This module computes a
 * per-cue reading load and extends cue endTimes (never shortens) so viewers can
 * finish reading the translation, subject to extension caps. It never overlaps
 * the next cue and never splits a cue.
 *
 * No I/O, no DOM, no project-type imports — generic over the cue shape so it is
 * trivially testable and reusable (a future wrapping sub-project reuses
 * computeReadingSpeed).
 */

/** Chars/sec reading rate for the ORIGINAL (source) line — native scan. */
export const CPS_ORIG = 20;
/** Chars/sec reading rate for the TRANSLATION — learner studying a foreign line. */
export const CPS_TRANS = 12;
/** Breathing room (seconds) beyond the computed read time. */
export const READ_MARGIN_S = 0.3;

/** Never extend a cue beyond start + MAX_EXT_ABS (runaway guard). */
export const MAX_EXT_ABS = 4;
/** Minimum gap (seconds) left before the next cue to avoid overlap. */
export const NEXT_CUE_GAP_S = 0.05;

/**
 * Sentinel endTime for the single currently-open DOM cue whose end is unknown.
 * (The Max scraper uses this until the next sample closes the cue precisely.)
 * `Number.MAX_SAFE_INTEGER` — NOT `86400` (a 24h film would overflow the latter).
 */
export const OPEN_CUE_END_SENTINEL = Number.MAX_SAFE_INTEGER;

/** Character count of a text (trivial, but centralised for future CJK tuning). */
export function countChars(text: string): number {
  return text.length;
}

/**
 * Reading load the cue imposes on the viewer: the max of the two texts'
 * independent read times-per-char. Measures the cue itself, independent of its
 * actual on-screen duration.
 *
 * Field semantics (matches the overlay at subtitleOverlay.ts:355):
 *   cue.text         = the TRANSLATED line — read at CPS_TRANS (slower).
 *   cue.originalText = the SOURCE line      — read at CPS_ORIG  (faster).
 * When originalText is absent (translation-only cue), only the translated term
 * counts.
 */
export function computeReadingSpeed(cue: { text: string; originalText?: string }): number {
  const transTime = countChars(cue.text) / CPS_TRANS;
  const origTime = cue.originalText ? countChars(cue.originalText) / CPS_ORIG : 0;
  return Math.max(transTime, origTime);
}

/**
 * Minimum duration (seconds) a viewer needs to read this bilingual cue:
 * readTime + READ_MARGIN_S.
 */
export function requiredReadDuration(cue: { text: string; originalText?: string }): number {
  return computeReadingSpeed(cue) + READ_MARGIN_S;
}

/** Minimal cue shape this module operates on (generic over the full type). */
interface TimedCue {
  startTime: number;
  endTime: number;
  text: string;
  originalText?: string;
}

/**
 * Adapt the endTimes of a cue array so each bilingual cue is readable in its
 * window, subject to the extend+cap policy. PURE: returns a new array; input
 * (array and cue objects) is not mutated.
 *
 * Policy per cue i (input sorted by startTime):
 *   required    = requiredReadDuration(cue[i])
 *   candidate   = start(i) + required               // ideal: just enough to read
 *   absCap      = start(i) + MAX_EXT_ABS            // hard ceiling (runaway guard)
 *   neighborCap = (cue[i+1] ? cue[i+1].start - NEXT_CUE_GAP_S : Infinity)
 *   finalEnd    = max( originalEnd(i),              // never shorten (floor)
 *                      min( candidate, absCap, neighborCap ) )
 *
 * IDEMPOTENT BY CONSTRUCTION: finalEnd depends only on start(i), the cue's
 * texts (constant per cue), the constant MAX_EXT_ABS, and cue[i+1].start —
 * never on the (mutable) originalEnd(i) except as a floor. So re-running on
 * already-adapted cues is a no-op. This is required because the coordinator
 * re-adapts the whole merged array on every progressive chunk.
 *
 * - Sparse (undefined) slots in the input are skipped (coordinator's progressive
 *   merge can produce a sparse array before all chunks land).
 */
export function adaptCueTimings<T extends TimedCue>(cues: T[]): T[] {
  // Drop sparse/undefined slots; work on a dense snapshot of references. Each
  // cue we mutate is shallow-copied so the input cue objects stay untouched.
  const dense = cues.filter((c): c is T => c != null);
  if (dense.length === 0) return [];

  const out: T[] = [];
  for (let i = 0; i < dense.length; i++) {
    const cue = dense[i];
    const next = dense[i + 1]; // may be undefined for the last cue

    const start = cue.startTime;
    const originalEnd = cue.endTime;
    const required = requiredReadDuration(cue);

    const candidate = start + required;
    const absCap = start + MAX_EXT_ABS;
    const neighborCap = next ? next.startTime - NEXT_CUE_GAP_S : Infinity;

    const capped = Math.min(candidate, absCap, neighborCap);
    // Never shorten: original endTime is the floor.
    const finalEnd = Math.max(originalEnd, capped);

    if (finalEnd === originalEnd) {
      out.push(cue);
    } else {
      out.push({ ...cue, endTime: finalEnd });
    }
  }
  return out;
}
