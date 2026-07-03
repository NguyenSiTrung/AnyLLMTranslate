/**
 * Tests for fontMetrics — font-metrics-based text geometry measurement.
 *
 * Uses a mocked Canvas 2D context whose `measureText` returns deterministic
 * per-character widths so line-wrapping and height are predictable.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  measureBoxHeight,
  measureWord,
  wrapTextIntoLines,
  clearFontMetricsCache,
} from '../fontMetrics';

/** Build a fake 2D context whose measureText width = chars × charWidth. */
function mockContext(charWidth: number): { ctx: object; measureText: ReturnType<typeof vi.fn> } {
  const measureText = vi.fn((s: string) => ({ width: s.length * charWidth }));
  const ctx = { font: '', measureText } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  return { ctx, measureText };
}

const SANS = "'Inter', sans-serif";

beforeEach(() => {
  clearFontMetricsCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('measureBoxHeight', () => {
  it('returns a single line when text fits the width', () => {
    // charWidth=2 → "ab" (2 chars) = 4px, fits in 100px width
    const { measureText } = mockContext(2);
    const result = measureBoxHeight('ab', 100, { fontFamily: SANS, fontSize: 14 });
    expect(result.lines).toBe(1);
    // Each measureText call corresponds to one word + one space probe.
    expect(measureText).toHaveBeenCalled();
  });

  it('wraps into multiple lines when text exceeds the width', () => {
    // charWidth=10 → word "aaa"=30px. effectiveWidth=max(40-6,1)=34.
    // "aaa"(30)≤34 fits on line; +space(10)+"bbb"(30)=70>34 → wrap → "bbb"
    // on next line; same for "ccc". → 3 lines (one word each).
    mockContext(10);
    const result = measureBoxHeight('aaa bbb ccc', 40, { fontFamily: SANS, fontSize: 14 });
    expect(result.lines).toBe(3);
  });

  it('groups words that fit together on the same line', () => {
    // charWidth=2 → word "ab"=4px, space=2px. effectiveWidth=max(94,10)=94.
    // "ab cd ef" → 4+2+4=10 ≤ 94 → all on one line.
    mockContext(2);
    const result = measureBoxHeight('ab cd ef', 100, { fontFamily: SANS, fontSize: 14 });
    expect(result.lines).toBe(1);
  });

  it('computes height = lines × (fontSize × lineHeightFactor) + padding', () => {
    mockContext(2);
    // "ab cd ef gh" with effectiveWidth=94: 4+2+4+2+4+2+4 = 22 ≤ 94 → 1 line
    // Actually let's force 2 lines: charWidth=20, word "ab"=40px, effectiveWidth=44.
    // "ab cd" → "ab"=40 ≤44 fits, +space(20)+40=100>44 → "cd" on new line → 2 lines
    vi.restoreAllMocks();
    mockContext(20);
    const result = measureBoxHeight('ab cd', 50, { fontFamily: SANS, fontSize: 14 });
    expect(result.lines).toBe(2);
    // height = 2 lines × 14 × 1.45 + padding(2) = 40.6 + 2 = 42.6
    expect(result.height).toBeCloseTo(42.6, 1);
  });

  it('handles empty text as a single line', () => {
    mockContext(2);
    const result = measureBoxHeight('', 100, { fontFamily: SANS, fontSize: 14 });
    expect(result.lines).toBe(1);
    expect(result.height).toBeGreaterThan(0);
  });

  it('char-breaks words longer than the available width', () => {
    // charWidth=10, word "abcdef" = 60px, effectiveWidth=max(20-6,10)=14.
    // A single char is 10px ≤ 14, so chars wrap: 6 chars / 1 per line = 6 lines.
    mockContext(10);
    const result = measureBoxHeight('abcdef', 20, { fontFamily: SANS, fontSize: 14 });
    expect(result.lines).toBe(6);
  });
});

describe('measureWord', () => {
  it('returns the measured width from the canvas context', () => {
    const { measureText } = mockContext(5);
    const w = measureWord('hello', { fontFamily: SANS, fontSize: 14 });
    // 5 chars × 5px = 25
    expect(w).toBe(25);
    expect(measureText).toHaveBeenCalledWith('hello');
  });

  it('caches per-word measurements so measureText is called once per word per font', () => {
    const { measureText } = mockContext(3);
    const opts = { fontFamily: SANS, fontSize: 14 };
    measureWord('hello', opts);
    measureWord('hello', opts);
    measureWord('hello', opts);
    expect(measureText).toHaveBeenCalledTimes(1);
  });

  it('re-measures when the font family changes (separate cache slot)', () => {
    const { measureText } = mockContext(3);
    measureWord('hello', { fontFamily: SANS, fontSize: 14 });
    measureWord('hello', { fontFamily: 'Georgia, serif', fontSize: 14 });
    // Two different fonts → two measureText calls
    expect(measureText).toHaveBeenCalledTimes(2);
  });

  it('re-measures when the font size changes (separate cache slot)', () => {
    const { measureText } = mockContext(3);
    measureWord('hello', { fontFamily: SANS, fontSize: 14 });
    measureWord('hello', { fontFamily: SANS, fontSize: 16 });
    expect(measureText).toHaveBeenCalledTimes(2);
  });
});

describe('wrapTextIntoLines', () => {
  it('returns wrapped lines respecting the max width', () => {
    mockContext(10);
    // charWidth=10: word "ab"=20px. effectiveWidth=max(50-6,10)=44.
    // "ab cd" → "ab"(20)+space(10)+"cd"(20)=50 > 44 → "cd" wraps → ["ab","cd"]
    const lines = wrapTextIntoLines('ab cd', 50, { fontFamily: SANS, fontSize: 14 });
    expect(lines).toEqual(['ab', 'cd']);
  });

  it('collapses repeated whitespace', () => {
    mockContext(2);
    const lines = wrapTextIntoLines('  ab   cd  ', 100, { fontFamily: SANS, fontSize: 14 });
    expect(lines).toEqual(['ab cd']);
  });
});

describe('cache invalidation', () => {
  it('clearFontMetricsCache forces re-measurement on next call', () => {
    const { measureText } = mockContext(3);
    const opts = { fontFamily: SANS, fontSize: 14 };
    measureWord('hello', opts);
    expect(measureText).toHaveBeenCalledTimes(1);
    clearFontMetricsCache();
    measureWord('hello', opts);
    expect(measureText).toHaveBeenCalledTimes(2);
  });
});

describe('fallback when canvas is unavailable', () => {
  it('falls back to a heuristic width estimate when getContext returns null', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    // With no canvas, measureWord falls back to fontSize × 0.5 per char avg.
    // "hello" = 5 chars × 14 × 0.5 = 35
    const w = measureWord('hello', { fontFamily: SANS, fontSize: 14 });
    expect(w).toBeGreaterThan(0);
    expect(w).toBe(5 * 14 * 0.5);
  });

  it('measureBoxHeight still returns a sane height without a canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const result = measureBoxHeight('some longer text that should wrap', 50, {
      fontFamily: SANS,
      fontSize: 14,
    });
    expect(result.lines).toBeGreaterThanOrEqual(1);
    expect(result.height).toBeGreaterThan(0);
  });
});
