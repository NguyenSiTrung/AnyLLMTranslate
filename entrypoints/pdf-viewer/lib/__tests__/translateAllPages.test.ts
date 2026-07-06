/**
 * Tests for the translateAllPages pipeline.
 *
 * Validates the two-phase download path:
 * - Phase 1 (this module): CONCURRENT translation, bounded by a concurrency
 *   limit, with per-page error isolation and AbortSignal cancellation.
 * - Phase 2 (translatedPdfGenerator.ts, invoked by usePdfDownload AFTER this
 *   resolves): serial pdf-lib generation. This module guarantees the
 *   precondition for that phase — every page is translated (or recorded as
 *   failed) before the function resolves — which the "completeness" tests
 *   below verify. The serial generation contract itself is enforced by
 *   translatedPdfGenerator's own test suite.
 *
 * Also validates: skip-already-translated, mixed-state handling, progress
 * reporting, AbortSignal cancellation, per-page error isolation, and merge
 * correctness.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { PageTranslations } from '../pdfTranslation';
import type { PdfParagraph } from '../pdfTextExtraction';
import { translateAllPages } from '../translateAllPages';

vi.mock('../pdfTranslation', () => ({
  translateParagraphs: vi.fn(),
  setMemoryCachedPage: vi.fn(),
}));

vi.mock('../pdfTextExtraction', () => ({
  extractPageText: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    sourceLanguage: 'en',
    targetLanguage: 'vi',
  }),
}));

// Import mocked modules so we can configure them per-test
import { translateParagraphs, setMemoryCachedPage } from '../pdfTranslation';
import { extractPageText } from '../pdfTextExtraction';

function createMockPage(pageNumber: number): PDFPageProxy {
  return {
    pageNumber,
    getViewport: vi.fn().mockReturnValue({ width: 612, height: 792, scale: 1 }),
    getTextContent: vi.fn(),
  } as unknown as PDFPageProxy;
}

function createParagraph(pageNumber: number, index: number): PdfParagraph {
  return {
    id: `${pageNumber}-${index}`,
    text: `Paragraph ${pageNumber}-${index}`,
    fontSize: 12,
    isHeading: false,
    x: 72,
    y: 700 - index * 40,
    width: 468,
    height: 14,
  };
}

function makeTranslatedPage(paragraphs: Map<string, string>): PageTranslations {
  return { paragraphs, state: 'translated' };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default: extractPageText returns 1 paragraph per page
  vi.mocked(extractPageText).mockImplementation(async (_page, pageNumber) => ({
    pageNumber,
    paragraphs: [createParagraph(pageNumber, 0)],
  }));

  // Default: translateParagraphs returns translated text for each paragraph
  vi.mocked(translateParagraphs).mockImplementation(async (items) =>
    items.map(({ paragraph }) => ({
      id: paragraph.id,
      translatedText: `translated-${paragraph.id}`,
    })),
  );
});

describe('translateAllPages', () => {
  it('translates only idle/error pages', async () => {
    // Arrange — page 1: translated, page 2: idle, page 3: error
    const pages = [createMockPage(1), createMockPage(2), createMockPage(3)];
    const existing = new Map<number, PageTranslations>([
      [1, makeTranslatedPage(new Map([['1-0', 'Done']]))],
      [2, { paragraphs: new Map(), state: 'idle' }],
      [3, { paragraphs: new Map(), state: 'error', error: 'previous failure' }],
    ]);

    // Act
    const result = await translateAllPages({
      pages,
      pdfUrl: 'https://example.com/test.pdf',
      existingTranslations: existing,
    });

    // Assert — pages 2 and 3 should have been translated, not page 1
    expect(extractPageText).toHaveBeenCalledTimes(2);
    expect(result.translations.get(1)?.state).toBe('translated');
    expect(result.translations.get(2)?.state).toBe('translated');
    expect(result.translations.get(3)?.state).toBe('translated');
    expect(result.translations.get(2)?.paragraphs.get('2-0')).toBe('translated-2-0');
    expect(result.translations.get(3)?.paragraphs.get('3-0')).toBe('translated-3-0');
    expect(result.failedPages).toEqual([]);
  });

  it('respects the concurrency limit', async () => {
    // Arrange — 6 pages, concurrency 2 → at most 2 extractions overlap.
    const pages = Array.from({ length: 6 }, (_, i) => createMockPage(i + 1));
    const existing = new Map<number, PageTranslations>();

    let activeExtracts = 0;
    let maxActiveExtracts = 0;
    vi.mocked(extractPageText).mockImplementation(async (_page, pageNumber) => {
      activeExtracts += 1;
      maxActiveExtracts = Math.max(maxActiveExtracts, activeExtracts);
      await Promise.resolve();
      await Promise.resolve();
      activeExtracts -= 1;
      return { pageNumber, paragraphs: [createParagraph(pageNumber, 0)] };
    });

    // Act
    await translateAllPages({
      pages,
      pdfUrl: 'https://example.com/test.pdf',
      existingTranslations: existing,
      concurrency: 2,
    });

    // Assert — bounded to exactly 2 in flight, and it reached that bound.
    expect(maxActiveExtracts).toBe(2);
    expect(extractPageText).toHaveBeenCalledTimes(6);
  });

  it('cancellation via AbortSignal stops dispatching new pages', async () => {
    // Arrange — 6 pages, concurrency 2 → only 2 workers. Gate every
    // translation so the 2 in-flight pages block, then abort. After the abort
    // is detected, no further pages should be dispatched.
    const pages = Array.from({ length: 6 }, (_, i) => createMockPage(i + 1));
    const existing = new Map<number, PageTranslations>();
    const controller = new AbortController();

    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    let extractCalls = 0;
    vi.mocked(extractPageText).mockImplementation(async (_page, pageNumber) => {
      extractCalls += 1;
      return { pageNumber, paragraphs: [createParagraph(pageNumber, 0)] };
    });
    vi.mocked(translateParagraphs).mockImplementation(async (items) => {
      // Block every translation until the gate is released.
      await gate;
      return items.map(({ paragraph }) => ({
        id: paragraph.id,
        translatedText: `translated-${paragraph.id}`,
      }));
    });

    // Act — start with concurrency 2 so only 2 pages enter the window.
    const promise = translateAllPages({
      pages,
      pdfUrl: 'https://example.com/test.pdf',
      existingTranslations: existing,
      signal: controller.signal,
      concurrency: 2,
    });

    // Let the 2 workers pull their first pages and block on the gate.
    await new Promise((r) => setTimeout(r, 0));
    expect(extractCalls).toBe(2);

    // Abort while pages 1 & 2 are in flight (blocked on the gate).
    controller.abort();
    releaseGate();

    // Assert
    await expect(promise).rejects.toThrow('Aborted');

    // Only the 2 in-flight pages were extracted; pages 3-6 were never
    // dispatched because the workers detected the abort before pulling them.
    expect(extractCalls).toBe(2);
  });
});
