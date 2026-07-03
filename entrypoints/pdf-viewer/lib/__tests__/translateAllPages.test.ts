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
  it('skips pages already in translated state', async () => {
    // Arrange
    const pages = [createMockPage(1), createMockPage(2)];
    const existing = new Map<number, PageTranslations>([
      [1, makeTranslatedPage(new Map([['1-0', 'Đã dịch']]))],
    ]);

    // Act
    const result = await translateAllPages({
      pages,
      pdfUrl: 'https://example.com/test.pdf',
      existingTranslations: existing,
    });

    // Assert — only page 2 should have been extracted/translated
    expect(extractPageText).toHaveBeenCalledTimes(1);
    expect(extractPageText).toHaveBeenCalledWith(pages[1], 2);
    expect(translateParagraphs).toHaveBeenCalledTimes(1);
    // Page 1 should still be in the result with its original translation
    expect(result.translations.get(1)?.paragraphs.get('1-0')).toBe('Đã dịch');
    // Page 2 should have the new translation
    expect(result.translations.get(2)?.paragraphs.get('2-0')).toBe('translated-2-0');
    expect(result.failedPages).toEqual([]);
  });

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

  it('progress callback reports correct counts', async () => {
    // Arrange
    const pages = [createMockPage(1), createMockPage(2), createMockPage(3)];
    const existing = new Map<number, PageTranslations>();
    const onProgress = vi.fn();

    // Act
    await translateAllPages({
      pages,
      pdfUrl: 'https://example.com/test.pdf',
      existingTranslations: existing,
      onProgress,
    });

    // Assert — completedCount is a shared counter incremented as each page
    // settles, so the nth onProgress call is always (n, total) regardless of
    // which page finishes first under concurrency.
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 3);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 3);
    expect(onProgress).toHaveBeenNthCalledWith(3, 3, 3);
  });

  it('translates pages concurrently (multiple pages in flight)', async () => {
    // Arrange — 4 pages, concurrency 4 → all 4 extractions should overlap.
    const pages = [
      createMockPage(1),
      createMockPage(2),
      createMockPage(3),
      createMockPage(4),
    ];
    const existing = new Map<number, PageTranslations>();

    let activeExtracts = 0;
    let maxActiveExtracts = 0;
    vi.mocked(extractPageText).mockImplementation(async (_page, pageNumber) => {
      activeExtracts += 1;
      maxActiveExtracts = Math.max(maxActiveExtracts, activeExtracts);
      // Yield a couple of microtasks so sibling workers can enter the mock
      // before this one exits — proving the calls overlap in time.
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
      concurrency: 4,
    });

    // Assert — all 4 extractions overlapped (sequential processing would cap
    // the in-flight count at 1).
    expect(maxActiveExtracts).toBe(4);
    expect(extractPageText).toHaveBeenCalledTimes(4);
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

  it('does not resolve until every page has been translated', async () => {
    // Arrange — gate page 2's translation so it stays in flight while pages
    // 1 and 3 finish. The function must not resolve until page 2 completes,
    // guaranteeing the serial generation phase starts with a full dataset.
    const pages = [createMockPage(1), createMockPage(2), createMockPage(3)];
    const existing = new Map<number, PageTranslations>();

    let releasePage2: () => void = () => {};
    const page2Gate = new Promise<void>((resolve) => {
      releasePage2 = resolve;
    });
    vi.mocked(translateParagraphs).mockImplementation(async (items) => {
      if (items[0]?.pageNumber === 2) await page2Gate;
      return items.map(({ paragraph }) => ({
        id: paragraph.id,
        translatedText: `translated-${paragraph.id}`,
      }));
    });

    // Act
    const promise = translateAllPages({
      pages,
      pdfUrl: 'https://example.com/test.pdf',
      existingTranslations: existing,
    });

    // Give concurrent pages a chance to settle; page 2 is still gated.
    await new Promise((r) => setTimeout(r, 0));
    let resolved = false;
    void promise.then(() => {
      resolved = true;
    });
    await new Promise((r) => setTimeout(r, 0));

    // Assert — not resolved yet because page 2 is still in flight.
    expect(resolved).toBe(false);

    // Release page 2 → now the function can resolve with all 3 pages.
    releasePage2();
    const result = await promise;
    expect(result.translations.size).toBe(3);
    for (let i = 1; i <= 3; i++) {
      expect(result.translations.get(i)?.state).toBe('translated');
    }
  });

  it('all pages are translated before the function resolves', async () => {
    // Arrange — verifies the precondition for the serial pdf-lib generation
    // phase: when translateAllPages resolves, every untranslated page has a
    // 'translated' entry (or is recorded in failedPages).
    const pages = [createMockPage(1), createMockPage(2), createMockPage(3)];
    const existing = new Map<number, PageTranslations>();

    // Act
    const result = await translateAllPages({
      pages,
      pdfUrl: 'https://example.com/test.pdf',
      existingTranslations: existing,
    });

    // Assert
    expect(result.translations.size).toBe(3);
    for (let i = 1; i <= 3; i++) {
      expect(result.translations.get(i)?.state).toBe('translated');
    }
    expect(result.failedPages).toEqual([]);
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

  it('aborts immediately when the signal is already aborted', async () => {
    // Arrange
    const pages = [createMockPage(1), createMockPage(2)];
    const existing = new Map<number, PageTranslations>();
    const controller = new AbortController();
    controller.abort();

    // Act & Assert
    await expect(
      translateAllPages({
        pages,
        pdfUrl: 'https://example.com/test.pdf',
        existingTranslations: existing,
        signal: controller.signal,
      }),
    ).rejects.toThrow('Aborted');

    // No pages should have been extracted.
    expect(extractPageText).not.toHaveBeenCalled();
  });

  it('page failure continues with remaining pages', async () => {
    // Arrange
    const pages = [createMockPage(1), createMockPage(2), createMockPage(3)];
    const existing = new Map<number, PageTranslations>();

    // Page 2 fails during translation
    vi.mocked(translateParagraphs).mockImplementation(async (items) => {
      const pageNum = items[0]?.pageNumber;
      if (pageNum === 2) {
        throw new Error('LLM timeout for page 2');
      }
      return items.map(({ paragraph }) => ({
        id: paragraph.id,
        translatedText: `translated-${paragraph.id}`,
      }));
    });

    // Act
    const result = await translateAllPages({
      pages,
      pdfUrl: 'https://example.com/test.pdf',
      existingTranslations: existing,
    });

    // Assert — pages 1 and 3 succeed, page 2 fails (error isolation under
    // concurrency: one bad page never aborts the others).
    expect(result.translations.get(1)?.state).toBe('translated');
    expect(result.translations.get(1)?.paragraphs.get('1-0')).toBe('translated-1-0');
    expect(result.translations.get(3)?.state).toBe('translated');
    expect(result.translations.get(3)?.paragraphs.get('3-0')).toBe('translated-3-0');
    expect(result.failedPages).toEqual([2]);
    expect(result.errors.get(2)).toBe('LLM timeout for page 2');
    // Page 2 should not have a translated entry
    expect(result.translations.has(2)).toBe(false);
  });

  it('merges existing + new translations correctly', async () => {
    // Arrange — page 1 is already translated, pages 2+3 need translation
    const pages = [createMockPage(1), createMockPage(2), createMockPage(3)];
    const existingParagraphs = new Map([['1-0', 'Existing translation']]);
    const existing = new Map<number, PageTranslations>([
      [
        1,
        {
          paragraphs: existingParagraphs,
          originalParagraphs: [createParagraph(1, 0)],
          state: 'translated',
        },
      ],
    ]);

    // Act
    const result = await translateAllPages({
      pages,
      pdfUrl: 'https://example.com/test.pdf',
      existingTranslations: existing,
    });

    // Assert — all 3 pages should be in the result
    expect(result.translations.size).toBe(3);
    // Page 1: original existing translation preserved
    expect(result.translations.get(1)?.paragraphs.get('1-0')).toBe('Existing translation');
    expect(result.translations.get(1)?.state).toBe('translated');
    // Page 2: newly translated
    expect(result.translations.get(2)?.paragraphs.get('2-0')).toBe('translated-2-0');
    expect(result.translations.get(2)?.state).toBe('translated');
    // Page 3: newly translated
    expect(result.translations.get(3)?.paragraphs.get('3-0')).toBe('translated-3-0');
    expect(result.translations.get(3)?.state).toBe('translated');
    // Memory cache should have been updated for pages 2 and 3 only
    expect(setMemoryCachedPage).toHaveBeenCalledTimes(2);
    expect(result.failedPages).toEqual([]);
    expect(result.errors.size).toBe(0);
  });

  it('handles pages with no extractable text', async () => {
    // Arrange — page has no text (scanned image page)
    const pages = [createMockPage(1)];
    const existing = new Map<number, PageTranslations>();

    vi.mocked(extractPageText).mockResolvedValue({
      pageNumber: 1,
      paragraphs: [],
    });

    // Act
    const result = await translateAllPages({
      pages,
      pdfUrl: 'https://example.com/test.pdf',
      existingTranslations: existing,
    });

    // Assert — marked as translated with empty map, no LLM call
    expect(translateParagraphs).not.toHaveBeenCalled();
    expect(result.translations.get(1)?.state).toBe('translated');
    expect(result.translations.get(1)?.paragraphs.size).toBe(0);
    expect(result.failedPages).toEqual([]);
  });

  it('returns immediately when all pages are already translated', async () => {
    // Arrange
    const pages = [createMockPage(1), createMockPage(2)];
    const existing = new Map<number, PageTranslations>([
      [1, makeTranslatedPage(new Map([['1-0', 'A']]))],
      [2, makeTranslatedPage(new Map([['2-0', 'B']]))],
    ]);

    // Act
    const result = await translateAllPages({
      pages,
      pdfUrl: 'https://example.com/test.pdf',
      existingTranslations: existing,
    });

    // Assert — no extraction or translation calls
    expect(extractPageText).not.toHaveBeenCalled();
    expect(translateParagraphs).not.toHaveBeenCalled();
    expect(result.translations.size).toBe(2);
    expect(result.failedPages).toEqual([]);
  });
});
