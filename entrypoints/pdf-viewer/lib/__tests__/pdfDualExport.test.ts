/**
 * Dual PDF export pure helpers — side-by-side geometry + alternating order.
 */

import { describe, it, expect } from 'vitest';
import {
  computeSideBySidePageSize,
  buildAlternatingPageOrder,
  resolveDualPagePair,
  dualExportFilename,
} from '../pdfDualExport';

describe('pdfDualExport', () => {
  it('geometry, alternating order, page pairing, and filenames', () => {
    expect(computeSideBySidePageSize({ width: 100, height: 200 }, { width: 150, height: 180 })).toEqual({
      width: 250,
      height: 200,
    });
    expect(computeSideBySidePageSize({ width: 612, height: 792 }, { width: 612, height: 792 })).toEqual({
      width: 1224,
      height: 792,
    });

    expect(buildAlternatingPageOrder(3)).toEqual([
      { source: 'original', pageIndex: 0 },
      { source: 'translated', pageIndex: 0 },
      { source: 'original', pageIndex: 1 },
      { source: 'translated', pageIndex: 1 },
      { source: 'original', pageIndex: 2 },
      { source: 'translated', pageIndex: 2 },
    ]);
    expect(buildAlternatingPageOrder(0)).toEqual([]);

    expect(resolveDualPagePair(0, 5, 5)).toEqual({
      originalIndex: 0,
      translatedIndex: 0,
      missingTranslated: false,
    });
    expect(resolveDualPagePair(2, 3, 2)).toEqual({
      originalIndex: 2,
      translatedIndex: null,
      missingTranslated: true,
    });
    expect(resolveDualPagePair(1, 2, 4)).toEqual({
      originalIndex: 1,
      translatedIndex: 1,
      missingTranslated: false,
    });

    expect(dualExportFilename('paper', 'vi', 'mono')).toBe('paper_translated_vi.pdf');
    expect(dualExportFilename('paper', 'vi', 'dual-side-by-side')).toBe('paper.dual_vi.pdf');
    expect(dualExportFilename('paper', 'vi', 'dual-alternating')).toBe('paper.dual.alt_vi.pdf');
  });
});
