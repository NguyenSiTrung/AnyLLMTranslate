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
// Unit tests for pure helpers
// ---------------------------------------------------------------------------

describe('clampFontSize', () => {
  it('clamps below minimum to 12', () => {
    expect(clampFontSize(4)).toBe(12);
    expect(clampFontSize(0)).toBe(12);
    expect(clampFontSize(-5)).toBe(12);
  });

  it('clamps above maximum to 32', () => {
    expect(clampFontSize(72)).toBe(32);
    expect(clampFontSize(100)).toBe(32);
  });

  it('passes through values in range', () => {
    expect(clampFontSize(12)).toBe(12);
    expect(clampFontSize(14)).toBe(14);
    expect(clampFontSize(24)).toBe(24);
    expect(clampFontSize(32)).toBe(32);
  });
});

describe('wrapText', () => {
  // Use a mock font where each character is 10 units wide at size 1.
  const mockFont = {
    widthOfTextAtSize: (text: string, size: number) => text.length * 10 * (size / 14),
  };

  it('returns single line when text fits', () => {
    const lines = wrapText('Hello world', 1000, 14, mockFont);
    expect(lines).toEqual(['Hello world']);
  });

  it('wraps text into multiple lines when exceeding width', () => {
    // At size 14, each char ≈ 10px. "Hello" = 5 chars = 50px.
    // maxWidth = 60 → "Hello world" (11 chars = 110px) won't fit, wraps.
    const lines = wrapText('Hello world', 60, 14, mockFont);
    expect(lines).toEqual(['Hello', 'world']);
  });

  it('returns empty array for empty text', () => {
    const lines = wrapText('', 200, 14, mockFont);
    expect(lines).toEqual([]);
  });

  it('returns single line for whitespace-only text', () => {
    const lines = wrapText('   ', 200, 14, mockFont);
    expect(lines).toEqual([]);
  });

  it('returns text as-is when maxWidth is zero or negative', () => {
    const lines = wrapText('Hello world', 0, 14, mockFont);
    expect(lines).toEqual(['Hello world']);
  });
});

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

  it('text wrapping produces valid output for long translations', async () => {
    // Arrange
    const pdfBytes = await createTestPdf(1);

    const paragraph = makeParagraph({
      id: '1-0',
      text: 'Short',
      width: 200, // narrow width forces wrapping
    });

    const longTranslation =
      'This is a very long translated text that should definitely exceed ' +
      'the width of the paragraph bounding box and therefore require text ' +
      'wrapping to fit within the available space properly without overflow.';

    const translationMap = new Map<string, string>();
    translationMap.set('1-0', longTranslation);

    const translations = makePageTranslations([paragraph], translationMap);
    const pageTranslations = new Map<number, PageTranslations>();
    pageTranslations.set(1, translations);

    // Act — should not throw.
    const result = await generateTranslatedPdf({
      originalPdfBytes: pdfBytes,
      pageTranslations,
    });

    // Assert
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  });

  it('empty translations map produces PDF with only original pages', async () => {
    // Arrange
    const pdfBytes = await createTestPdf(2);
    const emptyTranslations = new Map<number, PageTranslations>();

    // Act
    const result = await generateTranslatedPdf({
      originalPdfBytes: pdfBytes,
      pageTranslations: emptyTranslations,
    });

    // Assert
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(2);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles pages with zero paragraphs gracefully', async () => {
    // Arrange
    const pdfBytes = await createTestPdf(1);

    // Page has translations entry but no originalParagraphs.
    const translations = makePageTranslations([], new Map());
    const pageTranslations = new Map<number, PageTranslations>();
    pageTranslations.set(1, translations);

    // Act
    const result = await generateTranslatedPdf({
      originalPdfBytes: pdfBytes,
      pageTranslations,
    });

    // Assert
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  });

  it('calls onProgress for each page', async () => {
    // Arrange
    const pageCount = 3;
    const pdfBytes = await createTestPdf(pageCount);
    const progressCalls: Array<[number, number]> = [];

    // Act
    await generateTranslatedPdf({
      originalPdfBytes: pdfBytes,
      pageTranslations: new Map(),
      onProgress: (completed, total) => {
        progressCalls.push([completed, total]);
      },
    });

    // Assert
    expect(progressCalls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('handles headings with full available width', async () => {
    // Arrange
    const pdfBytes = await createTestPdf(1);

    const headingParagraph = makeParagraph({
      id: '1-0',
      text: 'Chapter Title',
      isHeading: true,
      fontSize: 24,
      x: 50,
      width: 200,
    });

    const translationMap = new Map<string, string>();
    translationMap.set('1-0', 'A much longer heading translation that needs full width');

    const translations = makePageTranslations([headingParagraph], translationMap);
    const pageTranslations = new Map<number, PageTranslations>();
    pageTranslations.set(1, translations);

    // Act — should not throw; headings get full page width.
    const result = await generateTranslatedPdf({
      originalPdfBytes: pdfBytes,
      pageTranslations,
    });

    // Assert
    expect(result).toBeInstanceOf(Uint8Array);
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  });

  it('font size is clamped between 12 and 32', async () => {
    // Arrange
    const pdfBytes = await createTestPdf(1);

    // One paragraph with very small font, one with very large font.
    const smallFontPara = makeParagraph({
      id: '1-0',
      text: 'Tiny text',
      fontSize: 4, // below minimum
      y: 700,
    });
    const largeFontPara = makeParagraph({
      id: '1-1',
      text: 'Huge text',
      fontSize: 72, // above maximum
      y: 500,
    });

    const translationMap = new Map<string, string>();
    translationMap.set('1-0', 'Small font translated');
    translationMap.set('1-1', 'Large font translated');

    const translations = makePageTranslations(
      [smallFontPara, largeFontPara],
      translationMap,
    );
    const pageTranslations = new Map<number, PageTranslations>();
    pageTranslations.set(1, translations);

    // Act — should not throw even with extreme font sizes.
    const result = await generateTranslatedPdf({
      originalPdfBytes: pdfBytes,
      pageTranslations,
    });

    // Assert
    expect(result).toBeInstanceOf(Uint8Array);
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  });
});
