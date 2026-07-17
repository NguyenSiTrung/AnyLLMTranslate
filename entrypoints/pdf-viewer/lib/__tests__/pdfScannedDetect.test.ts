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

describe('scorePageScan', () => {
  it('scores empty text layer on large page as high scan score', () => {
    const score = scorePageScan({
      pageWidth: 612,
      pageHeight: 792,
      textCharCount: 0,
    });
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it('scores dense text as low scan score', () => {
    // ~5000 chars on letter page → density ~0.01
    const score = scorePageScan({
      pageWidth: 612,
      pageHeight: 792,
      textCharCount: 5000,
      textItemCount: 200,
    });
    expect(score).toBeLessThan(0.2);
  });

  it('scores sparse text mid-high', () => {
    const score = scorePageScan({
      pageWidth: 612,
      pageHeight: 792,
      textCharCount: 40,
    });
    expect(score).toBeGreaterThan(0.4);
  });
});

describe('assessDocumentScan', () => {
  it('flags heavily scanned documents by average threshold', () => {
    const assessment = assessDocumentScan([
      { pageWidth: 612, pageHeight: 792, textCharCount: 0 },
      { pageWidth: 612, pageHeight: 792, textCharCount: 5 },
      { pageWidth: 612, pageHeight: 792, textCharCount: 0 },
    ]);
    expect(assessment.heavilyScanned).toBe(true);
    expect(assessment.pureScanNoText).toBe(true);
    expect(assessment.averageScore).toBeGreaterThanOrEqual(HEAVY_SCAN_THRESHOLD);
  });

  it('does not flag dense multi-page docs', () => {
    const assessment = assessDocumentScan([
      { pageWidth: 612, pageHeight: 792, textCharCount: 4000 },
      { pageWidth: 612, pageHeight: 792, textCharCount: 3500 },
    ]);
    expect(assessment.heavilyScanned).toBe(false);
    expect(assessment.pureScanNoText).toBe(false);
    expect(assessment.averageScore).toBeLessThan(0.3);
  });

  it('handles empty input', () => {
    const assessment = assessDocumentScan([]);
    expect(assessment.heavilyScanned).toBe(false);
    expect(assessment.pageScores).toEqual([]);
  });
});

describe('shouldEnableOcrWorkaround', () => {
  const heavy = assessDocumentScan([
    { pageWidth: 612, pageHeight: 792, textCharCount: 0 },
    { pageWidth: 612, pageHeight: 792, textCharCount: 8 },
  ]);

  it('enables when detect + auto OCR on and heavily scanned with some text edge', () => {
    // pureScanNoText true for empty — OCR workaround for pure scan is skipped
    // (user message instead). Use sparse-but-not-empty mix:
    const sparse = assessDocumentScan([
      { pageWidth: 612, pageHeight: 792, textCharCount: 30 },
      { pageWidth: 612, pageHeight: 792, textCharCount: 25 },
    ]);
    // May or may not be heavy depending on density — force heavy via empty+sparse
    const mixed = {
      ...sparse,
      heavilyScanned: true,
      pureScanNoText: false,
    };
    expect(
      shouldEnableOcrWorkaround(mixed, { detectScanned: true, autoOcrWorkaround: true }),
    ).toBe(true);
  });

  it('disables when detectScanned is off', () => {
    expect(
      shouldEnableOcrWorkaround(heavy, { detectScanned: false, autoOcrWorkaround: true }),
    ).toBe(false);
  });

  it('does not enable OCR workaround for pure-scan no-text (message path)', () => {
    expect(
      shouldEnableOcrWorkaround(heavy, { detectScanned: true, autoOcrWorkaround: true }),
    ).toBe(false);
  });
});

describe('scannedOnlyMessage', () => {
  it('mentions scan / no text layer', () => {
    expect(scannedOnlyMessage().toLowerCase()).toMatch(/scan|text layer|ocr/);
  });
});
