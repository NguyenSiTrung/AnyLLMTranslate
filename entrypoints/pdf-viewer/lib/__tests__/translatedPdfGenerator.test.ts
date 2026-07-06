/**
 * Tests for the TranslatedPdfGenerator module.
 *
 * These tests use pdf-lib directly (no mocks) to create minimal test PDFs
 * and verify the generator produces valid output. We use the standard font
 * fallback (Helvetica) in tests since custom font embedding requires fontkit
 * WASM which is not available in the jsdom test environment.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateTranslatedPdf, clampFontSize, wrapText } from '../translatedPdfGenerator';
import type { PageTranslations } from '../pdfTranslation';
import type { PdfParagraph } from '../pdfTextExtraction';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal valid PDF with the given number of US Letter pages.
 *  Pages must have content (a Contents stream) for embedPdf to work. */
async function createTestPdf(pageCount = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([612, 792]); // US Letter
    // Draw invisible text to create a valid Contents stream.
    page.drawText(' ', { x: 0, y: 0, size: 1 });
  }
  return doc.save();
}

function makeParagraph(overrides: Partial<PdfParagraph> = {}): PdfParagraph {
  return {
    id: '1-0',
    text: 'Original text here',
    fontSize: 14,
    isHeading: false,
    x: 50,
    y: 700,
    width: 400,
    height: 20,
    ...overrides,
  };
}

function makePageTranslations(
  paragraphs: PdfParagraph[],
  translationMap: Map<string, string>,
  state: PageTranslations['state'] = 'translated',
): PageTranslations {
  return {
    paragraphs: translationMap,
    originalParagraphs: paragraphs,
    state,
  };
}

// ---------------------------------------------------------------------------
// Integration tests for generateTranslatedPdf
// ---------------------------------------------------------------------------

describe('generateTranslatedPdf', () => {
  it('generates valid PDF bytes (non-empty Uint8Array)', async () => {
    // Arrange
    const pdfBytes = await createTestPdf(1);
    const pageTranslations = new Map<number, PageTranslations>();

    // Act
    const result = await generateTranslatedPdf({
      originalPdfBytes: pdfBytes,
      pageTranslations,
    });

    // Assert
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);

    // Verify it's actually a valid PDF by loading it.
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  });

  it('preserves correct number of pages in output', async () => {
    // Arrange
    const pageCount = 3;
    const pdfBytes = await createTestPdf(pageCount);
    const pageTranslations = new Map<number, PageTranslations>();

    // Act
    const result = await generateTranslatedPdf({
      originalPdfBytes: pdfBytes,
      pageTranslations,
    });

    // Assert
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(pageCount);
  });

  it('math/figure paragraphs are not masked (translatedText === original)', async () => {
    // Arrange
    const pdfBytes = await createTestPdf(1);

    const mathParagraph = makeParagraph({
      id: '1-0',
      text: 'E = mc2',
    });
    const proseParagraph = makeParagraph({
      id: '1-1',
      text: 'This is regular prose.',
      y: 600,
    });

    const translationMap = new Map<string, string>();
    // Math paragraph: translated === original → should be skipped.
    translationMap.set('1-0', 'E = mc2');
    // Prose paragraph: translated differs → should be rendered.
    translationMap.set('1-1', 'This is translated prose.');

    const translations = makePageTranslations(
      [mathParagraph, proseParagraph],
      translationMap,
    );

    const pageTranslations = new Map<number, PageTranslations>();
    pageTranslations.set(1, translations);

    // Act
    const result = await generateTranslatedPdf({
      originalPdfBytes: pdfBytes,
      pageTranslations,
    });

    // Assert — the PDF is valid and has content.
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);

    // Verify the output differs from a no-translation run (prose was drawn).
    const noTransResult = await generateTranslatedPdf({
      originalPdfBytes: pdfBytes,
      pageTranslations: new Map(),
    });
    // Output with translations should differ from output without.
    expect(result.length).not.toBe(noTransResult.length);
  });
});
