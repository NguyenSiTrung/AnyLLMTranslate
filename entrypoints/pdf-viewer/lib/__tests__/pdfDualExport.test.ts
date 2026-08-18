/**
 * Dual PDF export pure helpers — side-by-side geometry + alternating order.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  computeSideBySidePageSize,
  buildAlternatingPageOrder,
  resolveDualPagePair,
  resolveSubsetPagePairs,
  buildSideBySideDualPdf,
  buildMergedMonoPdf,
  dualExportFilename,
} from '../pdfDualExport';

/** Fixture doc whose page i is (100 + i) points wide — width identifies pages. */
async function makeDoc(pageWidths: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const w of pageWidths) {
    const p = doc.addPage([w, 200]);
    // Blank pages have no content stream and cannot be embedded.
    p.drawRectangle({ x: 0, y: 0, width: 10, height: 10 });
  }
  return doc.save();
}

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

  describe('resolveSubsetPagePairs — subset translation mapping', () => {
    it('pairs each mono page with its mapped original page', () => {
      expect(resolveSubsetPagePairs([4, 0, 1], 5, 3)).toEqual([
        { originalIndex: 4, translatedIndex: 0, missingTranslated: false },
        { originalIndex: 0, translatedIndex: 1, missingTranslated: false },
        { originalIndex: 1, translatedIndex: 2, missingTranslated: false },
      ]);
    });

    it('marks pairs missing when mono has fewer pages than the mapping', () => {
      expect(resolveSubsetPagePairs([0, 2], 3, 1)).toEqual([
        { originalIndex: 0, translatedIndex: 0, missingTranslated: false },
        { originalIndex: 2, translatedIndex: null, missingTranslated: true },
      ]);
    });

    it('clamps out-of-range original indices defensively', () => {
      expect(resolveSubsetPagePairs([7], 3, 1)).toEqual([
        { originalIndex: 2, translatedIndex: 0, missingTranslated: false },
      ]);
    });

    it('returns no pairs for an empty mapping', () => {
      expect(resolveSubsetPagePairs([], 3, 2)).toEqual([]);
    });
  });

  it('buildSideBySideDualPdf pairs a subset mono page with its mapped original', async () => {
    // Original: 3 pages — the third is uniquely wide (300pt).
    const original = await PDFDocument.create();
    for (const size of [[100, 200], [100, 200], [300, 200]] as const) {
      const p = original.addPage([size[0], size[1]]);
      // Blank pages have no content stream and cannot be embedded.
      p.drawRectangle({ x: 0, y: 0, width: 10, height: 10 });
    }
    // Mono: single translated page 150pt wide (translation of original page 3).
    const mono = await PDFDocument.create();
    const monoPage = mono.addPage([150, 100]);
    monoPage.drawRectangle({ x: 0, y: 0, width: 10, height: 10 });

    const bytes = await buildSideBySideDualPdf({
      monoBytes: await mono.save(),
      originalBytes: await original.save(),
      monoToOriginalIndex: [2],
    });

    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(1);
    const page = out.getPage(0);
    // Width proves pairing used original page 3 (300) — not page 1 (100).
    expect(page.getWidth()).toBe(450);
    expect(page.getHeight()).toBe(200);
  });

  describe('buildMergedMonoPdf — accumulate translated ranges', () => {
    it('fills the whole original from two runs, latest wins on overlap', async () => {
      // Original: 16 pages, widths 101..116.
      const originalBytes = await makeDoc(Array.from({ length: 16 }, (_, i) => 101 + i));
      // Run 1 translated pages 1-5 (widths 201..205, one per original page).
      const run1 = await makeDoc(Array.from({ length: 5 }, (_, i) => 201 + i));
      // Run 2 translated pages 4-16 (widths 304..316) — overlaps run 1 on 4-5.
      const run2 = await makeDoc(Array.from({ length: 13 }, (_, i) => 304 + i));

      const bytes = await buildMergedMonoPdf({
        originalBytes,
        runs: [
          { monoBytes: run1, monoToOriginalIndex: [0, 1, 2, 3, 4] },
          { monoBytes: run2, monoToOriginalIndex: Array.from({ length: 13 }, (_, i) => 3 + i) },
        ],
      });

      const out = await PDFDocument.load(bytes);
      expect(out.getPageCount()).toBe(16);
      // Pages 1-3 from run 1 (2xx), pages 4-16 from run 2 (3xx, latest wins).
      const widths = Array.from({ length: 16 }, (_, i) => out.getPage(i).getWidth());
      expect(widths.slice(0, 3)).toEqual([201, 202, 203]);
      expect(widths.slice(3)).toEqual(Array.from({ length: 13 }, (_, i) => 304 + i));
    });

    it('embeds the original page when no run covered it', async () => {
      const originalBytes = await makeDoc([101, 102, 103]);
      const run1 = await makeDoc([201]); // translated page 2 only

      const out = await PDFDocument.load(
        await buildMergedMonoPdf({
          originalBytes,
          runs: [{ monoBytes: run1, monoToOriginalIndex: [1] }],
        }),
      );
      expect(out.getPageCount()).toBe(3);
      expect(out.getPage(0).getWidth()).toBe(101); // original
      expect(out.getPage(1).getWidth()).toBe(201); // translated
      expect(out.getPage(2).getWidth()).toBe(103); // original
    });

    it('ignores mappings pointing beyond the mono document', async () => {
      const originalBytes = await makeDoc([101]);
      const run1 = await makeDoc([201]);
      const out = await PDFDocument.load(
        await buildMergedMonoPdf({
          originalBytes,
          runs: [{ monoBytes: run1, monoToOriginalIndex: [0, 5, 9] }], // 5, 9 don't exist
        }),
      );
      expect(out.getPageCount()).toBe(1);
      expect(out.getPage(0).getWidth()).toBe(201);
    });

    it('returns just the original when there are no runs', async () => {
      const originalBytes = await makeDoc([101, 102]);
      const out = await PDFDocument.load(
        await buildMergedMonoPdf({ originalBytes, runs: [] }),
      );
      expect(out.getPageCount()).toBe(2);
    });
  });
});
