/**
 * Dual PDF export pure helpers — side-by-side geometry + alternating order.
 */

import { describe, it, expect } from 'vitest';
import {
  computeSideBySidePageSize,
  buildAlternatingPageOrder,
  resolveDualPagePair,
  dualExportFilename,
  type DualExportMode,
} from '../pdfDualExport';

describe('computeSideBySidePageSize', () => {
  it('sums widths and takes max height', () => {
    expect(computeSideBySidePageSize({ width: 100, height: 200 }, { width: 150, height: 180 })).toEqual({
      width: 250,
      height: 200,
    });
  });

  it('handles equal pages', () => {
    expect(computeSideBySidePageSize({ width: 612, height: 792 }, { width: 612, height: 792 })).toEqual({
      width: 1224,
      height: 792,
    });
  });
});

describe('buildAlternatingPageOrder', () => {
  it('interleaves original and translated: O1,T1,O2,T2…', () => {
    expect(buildAlternatingPageOrder(3)).toEqual([
      { source: 'original', pageIndex: 0 },
      { source: 'translated', pageIndex: 0 },
      { source: 'original', pageIndex: 1 },
      { source: 'translated', pageIndex: 1 },
      { source: 'original', pageIndex: 2 },
      { source: 'translated', pageIndex: 2 },
    ]);
  });

  it('returns empty for zero pages', () => {
    expect(buildAlternatingPageOrder(0)).toEqual([]);
  });
});

describe('resolveDualPagePair', () => {
  it('pairs matching indices when both exist', () => {
    expect(resolveDualPagePair(0, 5, 5)).toEqual({
      originalIndex: 0,
      translatedIndex: 0,
      missingTranslated: false,
    });
  });

  it('flags missing translation page when mono has fewer pages', () => {
    expect(resolveDualPagePair(2, 3, 2)).toEqual({
      originalIndex: 2,
      translatedIndex: null,
      missingTranslated: true,
    });
  });

  it('clamps to original count when mono is longer (unexpected)', () => {
    // Prefer original page count as source of truth for pairing.
    expect(resolveDualPagePair(1, 2, 4)).toEqual({
      originalIndex: 1,
      translatedIndex: 1,
      missingTranslated: false,
    });
  });
});

describe('dualExportFilename', () => {
  const cases: Array<[DualExportMode, string]> = [
    ['mono', 'paper_translated_vi.pdf'],
    ['dual-side-by-side', 'paper.dual_vi.pdf'],
    ['dual-alternating', 'paper.dual.alt_vi.pdf'],
  ];
  it.each(cases)('mode %s → %s', (mode, expected) => {
    expect(dualExportFilename('paper', 'vi', mode)).toBe(expected);
  });
});
