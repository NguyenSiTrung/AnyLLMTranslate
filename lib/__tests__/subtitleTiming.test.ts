/**
 * Tests for the pure subtitle timing-adaptation helper.
 * Bilingual overlay shows ~2x text of a native subtitle; timings must account
 * for reading BOTH the original and the translation.
 *
 * Field semantics (matches the overlay at subtitleOverlay.ts:355):
 *   cue.text         = the TRANSLATED line (read by the learner, slower rate)
 *   cue.originalText = the SOURCE line    (read natively, faster rate)
 */
import { describe, it, expect } from 'vitest';
import {
  CPS_TRANS,
  READ_MARGIN_S,
  MAX_EXT_ABS,
  NEXT_CUE_GAP_S,
  OPEN_CUE_END_SENTINEL,
  countChars,
  computeReadingSpeed,
  requiredReadDuration,
  adaptCueTimings,
} from '@/lib/subtitleTiming';

describe('countChars', () => {
  it('counts the length of a string', () => {
    expect(countChars('Hello')).toBe(5);
  });
  it('returns 0 for empty string', () => {
    expect(countChars('')).toBe(0);
  });
});

describe('computeReadingSpeed', () => {
  it('returns the max of the two texts independent read rates (original/source is faster here)', () => {
    // text = translation, 24 chars / CPS_TRANS(12) = 2.0
    // originalText = source, 40 chars / CPS_ORIG(20) = 2.0 -> max 2.0
    const cue = { text: 'a'.repeat(24), originalText: 'b'.repeat(40) };
    expect(computeReadingSpeed(cue)).toBeCloseTo(2.0, 5);
  });
  it('uses the translation text only when originalText is absent (translation-only cue)', () => {
    // No source line: only the translated term counts.
    const cue = { text: 'a'.repeat(24) };
    expect(computeReadingSpeed(cue)).toBeCloseTo(24 / CPS_TRANS, 5);
  });
});

describe('requiredReadDuration', () => {
  it('equals max read time + READ_MARGIN_S', () => {
    const cue = { text: 'a'.repeat(24), originalText: 'b'.repeat(40) };
    expect(requiredReadDuration(cue)).toBeCloseTo(2.0 + READ_MARGIN_S, 5);
  });
});

describe('adaptCueTimings', () => {
  it('extends a cue whose duration is shorter than required read time (to exactly required)', () => {
    // text 24 / CPS_TRANS(12) = 2.0 ; originalText 40 / CPS_ORIG(20) = 2.0
    // required = 2.0 + 0.3 = 2.3s. Original window 1.0s -> extend to 2.3s.
    const cues = [
      { startTime: 0, endTime: 1, text: 'a'.repeat(24), originalText: 'b'.repeat(40) },
    ];
    const out = adaptCueTimings(cues);
    expect(out[0].endTime).toBeCloseTo(2.3, 5);
  });

  it('does NOT shorten a cue that is already readable', () => {
    // required = 2.3s; window is 5s -> no change.
    const cues = [
      { startTime: 0, endTime: 5, text: 'a'.repeat(24), originalText: 'b'.repeat(40) },
    ];
    const out = adaptCueTimings(cues);
    expect(out[0].endTime).toBe(5);
  });

  it('caps extension at start + MAX_EXT_ABS when required read time exceeds it', () => {
    // Very long text -> required (e.g. 60s+) far exceeds abs cap (+4s).
    // window = 1s, start = 0 -> abs cap = 0 + 4 = 4.
    const cues = [
      { startTime: 0, endTime: 1, text: 'a'.repeat(500), originalText: 'b'.repeat(500) },
    ];
    const out = adaptCueTimings(cues);
    expect(out[0].endTime).toBeCloseTo(MAX_EXT_ABS, 5);
  });

  it('caps extension at nextCue.start - NEXT_CUE_GAP_S (never overlaps next cue)', () => {
    // required = 2.3s, but next cue starts at 1.5s -> cap = 1.5 - 0.05 = 1.45
    // (tighter than both required 2.3 and abs cap 4).
    const cues = [
      { startTime: 0, endTime: 1, text: 'a'.repeat(24), originalText: 'b'.repeat(40) },
      { startTime: 1.5, endTime: 3, text: 'next', originalText: 'next' },
    ];
    const out = adaptCueTimings(cues);
    expect(out[0].endTime).toBeCloseTo(1.5 - NEXT_CUE_GAP_S, 5);
  });

  it('the last cue (no next neighbor) is capped by abs only', () => {
    // required 2.3s, window 1s, no next cue -> abs cap (4) binds.
    const cues = [
      { startTime: 0, endTime: 1, text: 'a'.repeat(24), originalText: 'b'.repeat(40) },
    ];
    const out = adaptCueTimings(cues);
    expect(out[0].endTime).toBeCloseTo(2.3, 5); // required (2.3) < abs (4) -> extends to 2.3
  });

  it('the last cue with very long text still respects abs cap', () => {
    // required ~83s, window 1s, no next cue -> abs cap (4) binds.
    const cues = [
      { startTime: 5, endTime: 6, text: 'a'.repeat(500), originalText: 'b'.repeat(500) },
    ];
    const out = adaptCueTimings(cues);
    expect(out[0].endTime).toBeCloseTo(5 + MAX_EXT_ABS, 5); // start + 4
  });

  it('is pure: does not mutate the input array or its cues', () => {
    const cues = [
      { startTime: 0, endTime: 1, text: 'a'.repeat(24), originalText: 'b'.repeat(40) },
    ];
    const originalEnd = cues[0].endTime;
    adaptCueTimings(cues);
    expect(cues[0].endTime).toBe(originalEnd); // input unchanged
  });

  it('is idempotent: re-running on adapted output is a no-op', () => {
    const cues = [
      { startTime: 0, endTime: 1, text: 'a'.repeat(24), originalText: 'b'.repeat(40) },
      { startTime: 3, endTime: 4, text: 'c'.repeat(24), originalText: 'd'.repeat(40) },
      { startTime: 10, endTime: 11, text: 'e'.repeat(500), originalText: 'f'.repeat(500) },
    ];
    const once = adaptCueTimings(cues);
    const twice = adaptCueTimings(once);
    expect(twice.map((c) => c.endTime)).toEqual(once.map((c) => c.endTime));
  });

  it('skips sparse (undefined) slots in the input array', () => {
    // Coordinator's merge may produce a sparse array before all chunks arrive.
    const cues: Array<{ startTime: number; endTime: number; text: string; originalText?: string }> = [
      { startTime: 0, endTime: 1, text: 'a'.repeat(24), originalText: 'b'.repeat(40) },
      undefined as unknown as { startTime: number; endTime: number; text: string },
      { startTime: 3, endTime: 5, text: 'x', originalText: 'x' },
    ];
    const out = adaptCueTimings(cues);
    // Output is dense (no undefined), and the real cues are present.
    expect(out.every((c) => c && typeof c.startTime === 'number')).toBe(true);
    expect(out.map((c) => c.text)).toEqual(['a'.repeat(24), 'x']);
  });

  it('returns empty array for empty input', () => {
    expect(adaptCueTimings([])).toEqual([]);
  });
});

describe('OPEN_CUE_END_SENTINEL', () => {
  it('is the max safe integer (not 86400)', () => {
    expect(OPEN_CUE_END_SENTINEL).toBe(Number.MAX_SAFE_INTEGER);
    expect(OPEN_CUE_END_SENTINEL).not.toBe(86400);
  });
});
