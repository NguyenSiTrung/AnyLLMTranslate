/**
 * Scanned PDF score pure heuristics.
 */

import { describe, it, expect } from 'vitest';
import {
  scorePageScan,
  assessDocumentScan,
  shouldEnableOcrWorkaround,
  scannedOnlyMessage,
  HEAVY_SCAN_THRESHOLD,
} from '../pdfScannedDetect';

describe('pdfScannedDetect', () => {
  it('scores pages, assesses docs, and gates OCR workaround', () => {
    expect(
      scorePageScan({ pageWidth: 612, pageHeight: 792, textCharCount: 0 }),
    ).toBeGreaterThanOrEqual(0.9);
    expect(
      scorePageScan({
        pageWidth: 612,
        pageHeight: 792,
        textCharCount: 5000,
        textItemCount: 200,
      }),
    ).toBeLessThan(0.2);
    expect(
      scorePageScan({ pageWidth: 612, pageHeight: 792, textCharCount: 40 }),
    ).toBeGreaterThan(0.4);

    const heavy = assessDocumentScan([
      { pageWidth: 612, pageHeight: 792, textCharCount: 0 },
      { pageWidth: 612, pageHeight: 792, textCharCount: 5 },
      { pageWidth: 612, pageHeight: 792, textCharCount: 0 },
    ]);
    expect(heavy.heavilyScanned).toBe(true);
    expect(heavy.pureScanNoText).toBe(true);
    expect(heavy.averageScore).toBeGreaterThanOrEqual(HEAVY_SCAN_THRESHOLD);

    const dense = assessDocumentScan([
      { pageWidth: 612, pageHeight: 792, textCharCount: 4000 },
      { pageWidth: 612, pageHeight: 792, textCharCount: 3500 },
    ]);
    expect(dense.heavilyScanned).toBe(false);
    expect(dense.pureScanNoText).toBe(false);
    expect(dense.averageScore).toBeLessThan(0.3);

    const empty = assessDocumentScan([]);
    expect(empty.heavilyScanned).toBe(false);
    expect(empty.pageScores).toEqual([]);

    const sparse = assessDocumentScan([
      { pageWidth: 612, pageHeight: 792, textCharCount: 30 },
      { pageWidth: 612, pageHeight: 792, textCharCount: 25 },
    ]);
    const mixed = { ...sparse, heavilyScanned: true, pureScanNoText: false };
    expect(
      shouldEnableOcrWorkaround(mixed, { detectScanned: true, autoOcrWorkaround: true }),
    ).toBe(true);
    expect(
      shouldEnableOcrWorkaround(heavy, { detectScanned: false, autoOcrWorkaround: true }),
    ).toBe(false);
    expect(
      shouldEnableOcrWorkaround(heavy, { detectScanned: true, autoOcrWorkaround: true }),
    ).toBe(false);

    expect(scannedOnlyMessage().toLowerCase()).toMatch(/scan|text layer|ocr/);
  });
});
