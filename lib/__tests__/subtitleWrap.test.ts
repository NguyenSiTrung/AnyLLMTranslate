/**
 * Tests for the pure subtitle line-wrap helper.
 * Greedy word-fill into lines, capped at maxLines, char-per-line budget tied
 * to 5a's requiredReadDuration via lineBudgetForCue.
 */
import { describe, it, expect } from 'vitest';
import {
  BASE_CPL,
  CPL_FLOOR,
  CPL_CEIL,
  MAX_LINES_ORIG,
  MAX_LINES_TRANS,
  lineBudgetForCue,
  wrapSubtitleText,
} from '@/lib/subtitleWrap';

describe('wrapSubtitleText', () => {
  it('fits text that is under maxCharsPerLine into a single line', () => {
    const r = wrapSubtitleText('Hello world', 42, 2);
    expect(r.lines).toEqual(['Hello world']);
    expect(r.truncated).toBe(false);
  });

  it('greedy-fills words into multiple lines up to maxCharsPerLine', () => {
    // 5 words. maxCharsPerLine=10 -> greedy fits as many words as possible.
    // 'one two three'(13>10) so 'one two'(7) | 'three four'(10) | 'five'(4).
    const text = 'one two three four five';
    const r = wrapSubtitleText(text, 10, 3);
    expect(r.lines).toEqual(['one two', 'three four', 'five']);
    expect(r.truncated).toBe(false);
  });

  it('caps at maxLines and absorbs overflow into the last line (truncated=true)', () => {
    // 6 two-char words, maxCharsPerLine=5, maxLines=2 -> genuine overflow.
    //   'aa' -> 'aa bb'(5) -> 'cc'(5+1+2=8>5) flush line0='aa bb'
    //   'cc' -> 'cc dd'(5) -> 'ee'(8>5) flush line1; lines.length=2=maxLines -> absorb.
    const text = 'aa bb cc dd ee ff';
    const r = wrapSubtitleText(text, 5, 2);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toBe('aa bb');
    // Last line absorbs the remainder: cc dd ee ff.
    expect(r.lines[1]).toBe('cc dd ee ff');
    expect(r.truncated).toBe(true);
  });

  it('does NOT set truncated when text fits exactly within maxLines', () => {
    // 4 two-char words, width 5, maxLines 2 -> 'aa bb' | 'cc dd', fits exactly.
    const r = wrapSubtitleText('aa bb cc dd', 5, 2);
    expect(r.lines).toEqual(['aa bb', 'cc dd']);
    expect(r.truncated).toBe(false);
  });

  it('never splits a word: a single word longer than maxCharsPerLine gets its own line', () => {
    const text = 'short supercalifragilisticexpialidocious end';
    const r = wrapSubtitleText(text, 10, 3);
    // 'short' | 'supercalifragilisticexpialidocious' (own line, unsplittable) | 'end'
    expect(r.lines).toEqual(['short', 'supercalifragilisticexpialidocious', 'end']);
    expect(r.truncated).toBe(false);
  });

  it('an unsplittable word that overflows maxLines still absorbs (truncated=true)', () => {
    const text = 'a supercalifragilisticexpialidocious b c d';
    const r = wrapSubtitleText(text, 10, 2);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toBe('a');
    expect(r.lines[1]).toBe('supercalifragilisticexpialidocious b c d');
    expect(r.truncated).toBe(true);
  });

  it('collapses runs of whitespace into single spaces between words', () => {
    const r = wrapSubtitleText('one   two', 42, 2);
    expect(r.lines).toEqual(['one two']);
  });

  it('trims leading/trailing whitespace', () => {
    const r = wrapSubtitleText('  hello  ', 42, 2);
    expect(r.lines).toEqual(['hello']);
  });

  it('empty/whitespace-only input returns a single empty line, not truncated', () => {
    expect(wrapSubtitleText('', 42, 2)).toEqual({ lines: [''], truncated: false });
    expect(wrapSubtitleText('   ', 42, 2)).toEqual({ lines: [''], truncated: false });
  });

  it('maxLines=1 returns a single line, truncated if it overflows', () => {
    const r = wrapSubtitleText('one two three four', 10, 1);
    expect(r.lines).toEqual(['one two three four']);
    expect(r.truncated).toBe(true);
  });
});

describe('lineBudgetForCue', () => {
  it('returns the fixed 2+2 line caps', () => {
    const b = lineBudgetForCue(2, 2);
    expect(b.origMaxLines).toBe(MAX_LINES_ORIG);
    expect(b.transMaxLines).toBe(MAX_LINES_TRANS);
  });

  it('uses BASE_CPL when duration == requiredRead (ratio 1.0)', () => {
    const b = lineBudgetForCue(2, 2);
    expect(b.maxCharsPerLine).toBeCloseTo(BASE_CPL * 1.0, 5);
  });

  it('widens maxCharsPerLine when the cue has lots of time (ratio > 1, clamped at CEIL)', () => {
    // duration 10s, required 2s -> ratio 5 -> clamped to CEIL (1.4).
    const b = lineBudgetForCue(10, 2);
    expect(b.maxCharsPerLine).toBeCloseTo(BASE_CPL * CPL_CEIL, 5);
  });

  it('narrows maxCharsPerLine when the cue is tight (ratio < 1, clamped at FLOOR)', () => {
    // duration 1s, required 4s -> ratio 0.25 -> clamped to FLOOR (0.8).
    const b = lineBudgetForCue(1, 4);
    expect(b.maxCharsPerLine).toBeCloseTo(BASE_CPL * CPL_FLOOR, 5);
  });

  it('scales linearly between FLOOR and CEIL for mid-range ratios', () => {
    // ratio 1.1 -> within [0.8, 1.4], so 1.1 exactly.
    const b = lineBudgetForCue(11, 10);
    expect(b.maxCharsPerLine).toBeCloseTo(BASE_CPL * 1.1, 5);
  });

  it('does not divide by zero when requiredRead <= 0 (treats ratio as 1.0)', () => {
    const b0 = lineBudgetForCue(2, 0);
    expect(b0.maxCharsPerLine).toBeCloseTo(BASE_CPL, 5);
    const bNeg = lineBudgetForCue(2, -1);
    expect(bNeg.maxCharsPerLine).toBeCloseTo(BASE_CPL, 5);
  });
});
