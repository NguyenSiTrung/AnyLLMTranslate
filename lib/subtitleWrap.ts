/**
 * Subtitle line-wrapping — PURE module.
 *
 * Wraps each cue's text into a bounded, word-broken, line-balanced set of
 * lines. The char-per-line budget flexes with the cue's available reading time
 * (via 5a's requiredReadDuration), so comfortably-timed cues get wider lines
 * (fewer breaks) and tight cues get narrower ones.
 *
 * No I/O, no DOM, no project-type imports — trivially testable and reusable.
 */

/** Base characters-per-line for a comfortably-timed cue (Latin-script norm). */
export const BASE_CPL = 42;
/** Dynamic-CPL clamp floor (multiplier of BASE_CPL) for tight cues. */
export const CPL_FLOOR = 0.8;
/** Dynamic-CPL clamp ceiling (multiplier of BASE_CPL) for roomy cues. */
export const CPL_CEIL = 1.4;
/** Hard line cap for the original (source) block. */
export const MAX_LINES_ORIG = 2;
/** Hard line cap for the translation block. */
export const MAX_LINES_TRANS = 2;

export interface LineBudget {
  /** Max characters a single line should hold before wrapping. */
  maxCharsPerLine: number;
  /** Hard cap on line count for the original block. */
  origMaxLines: number;
  /** Hard cap on line count for the translation block. */
  transMaxLines: number;
}

export interface WrapResult {
  /** 1..maxLines entries; never empty (empty input yields ['']). */
  lines: string[];
  /** True if text overflowed maxLines (last line absorbed the remainder). */
  truncated: boolean;
}

/**
 * Compute the line budget for a cue from its available reading time.
 *
 * maxCharsPerLine = BASE_CPL × clamp(duration / requiredRead, FLOOR, CEIL).
 * A cue with lots of time (ratio > 1) gets wider lines (fewer breaks); a tight
 * cue (ratio < 1) gets narrower lines (safer fit). Line caps are the fixed 2+2
 * hard limit regardless of timing.
 *
 * When requiredRead <= 0 (degenerate/empty cue), the ratio is treated as 1.0
 * so maxCharsPerLine = BASE_CPL (no divide-by-zero).
 */
export function lineBudgetForCue(duration: number, requiredRead: number): LineBudget {
  const ratio = requiredRead > 0 ? duration / requiredRead : 1;
  const multiplier = Math.max(CPL_FLOOR, Math.min(CPL_CEIL, ratio));
  return {
    maxCharsPerLine: BASE_CPL * multiplier,
    origMaxLines: MAX_LINES_ORIG,
    transMaxLines: MAX_LINES_TRANS,
  };
}

/**
 * Greedy-fill words into lines up to maxCharsPerLine, capped at maxLines.
 *
 * - Words are split on whitespace; runs of whitespace collapse to single
 *   spaces, and leading/trailing whitespace is trimmed.
 * - Breaks only at word boundaries. A single word longer than maxCharsPerLine
 *   occupies its own line (it cannot be split).
 * - On overflow past maxLines, the last line absorbs the remaining words
 *   (joined by single spaces) and truncated = true. No silent drop.
 * - Empty/whitespace input returns { lines: [''], truncated: false }.
 *
 * Greedy (not optimal raggedness) is used: it is O(n), deterministic, and
 * "good enough" for subtitle display where the line cap matters more than
 * perfect balance.
 *
 * Implementation note: a running wordIndex is tracked so that on overflow the
 * remainder slice starts strictly AFTER the word currently held in `current`
 * (avoiding a double-count of that word).
 */
export function wrapSubtitleText(text: string, maxCharsPerLine: number, maxLines: number): WrapResult {
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return { lines: [''], truncated: false };

  const lines: string[] = [];
  let current = '';
  let i = 0;

  while (i < words.length) {
    const word = words[i];
    if (current === '') {
      current = word;
      i++;
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current += ' ' + word;
      i++;
    } else {
      // Word doesn't fit on the current line — flush current, start a new line.
      lines.push(current);
      current = '';
      if (lines.length >= maxLines) {
        // Cap reached: absorb the remaining words (i..end) into the last line.
        // `current` was just cleared, so the remainder is exactly words[i..].
        const remainder = words.slice(i);
        if (remainder.length > 0) {
          lines[lines.length - 1] = lines[lines.length - 1] + ' ' + remainder.join(' ');
        }
        return { lines: lines.slice(0, maxLines), truncated: true };
      }
    }
  }

  // No overflow — flush the final line.
  if (current !== '') lines.push(current);
  return { lines, truncated: false };
}
