/**
 * usePdfLookahead — Tests for the low-priority 2-page look-ahead scheduler.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { PdfPageText, PdfParagraph } from '../../lib/pdfTextExtraction';
import type { TranslationResultItem } from '@/types/messages';
import { usePdfLookahead } from '../usePdfLookahead';

// Mock downstream modules so the hook is exercised in isolation.
vi.mock('../../lib/pdfTextExtraction', () => ({
  extractPageText: vi.fn(),
}));

vi.mock('../../lib/pdfTranslation', () => ({
  translateParagraphs: vi.fn(),
  getMemoryCachedPage: vi.fn(),
  setMemoryCachedPage: vi.fn(),
}));

// Settings partial is sufficient — the hook only reads sourceLanguage /
// targetLanguage. Setting it in the factory keeps the loosely-typed mock
// (a typed `mockResolvedValue` would require a full ExtensionSettings object).
vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    sourceLanguage: 'en',
    targetLanguage: 'vi',
  }),
}));

import { extractPageText } from '../../lib/pdfTextExtraction';
import {
  translateParagraphs,
  getMemoryCachedPage,
  setMemoryCachedPage,
} from '../../lib/pdfTranslation';

const mockExtractPageText = vi.mocked(extractPageText);
const mockTranslateParagraphs = vi.mocked(translateParagraphs);
const mockGetMemoryCachedPage = vi.mocked(getMemoryCachedPage);
const mockSetMemoryCachedPage = vi.mocked(setMemoryCachedPage);

/** Props shape passed to the hook via renderHook. */
interface HookProps {
  pages: PDFPageProxy[];
  pdfUrl: string;
  translatedPages: Set<number>;
  lookAheadRange?: number;
  enabled?: boolean;
}

/** A manually-resolved promise (avoids non-null-assertion). */
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolveFn: ((value: T) => void) | null = null;
  let rejectFn: ((error: unknown) => void) | null = null;
  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  return {
    promise,
    resolve: (value: T) => {
      if (resolveFn) resolveFn(value);
    },
    reject: (error: unknown) => {
      if (rejectFn) rejectFn(error);
    },
  };
}

/** Flush pending microtasks/macrotasks so async look-ahead work settles.
 *  Used inside `act(async () => { ...; await flush(); })` so React flushes
 *  effects and the look-ahead's microtask chain drains within the act. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makePages(count: number): PDFPageProxy[] {
  return Array.from({ length: count }, (_, i) => ({
    pageNumber: i + 1,
  } as unknown as PDFPageProxy));
}

function makeParagraphs(pageNumber: number, count = 1): PdfParagraph[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${pageNumber}-${i}`,
    text: `paragraph ${pageNumber}-${i}`,
    fontSize: 10,
    isHeading: false,
    x: 0,
    y: 0,
    width: 100,
    height: 10,
  }));
}

function makePageText(pageNumber: number): PdfPageText {
  return { pageNumber, paragraphs: makeParagraphs(pageNumber) };
}

function translateResults(pageNumber: number): TranslationResultItem[] {
  return makeParagraphs(pageNumber).map((p) => ({
    id: p.id,
    translatedText: `translated ${p.id}`,
  }));
}

/** Page numbers that look-ahead sent to translateParagraphs. */
function translatedPageNumbers(): number[] {
  return mockTranslateParagraphs.mock.calls
    .map(([items]) => (items as Array<{ pageNumber: number }> | undefined)?.[0]?.pageNumber)
    .filter((n): n is number => typeof n === 'number');
}

/** Page numbers that look-ahead passed to extractPageText. */
function extractedPageNumbers(): number[] {
  return mockExtractPageText.mock.calls.map(([, pageNumber]) => pageNumber);
}

/** (url, page) pairs written to the in-memory cache. */
function storedEntries(): Array<{ url: string; page: number }> {
  return mockSetMemoryCachedPage.mock.calls.map(([url, page]) => ({
    url,
    page,
  }));
}

const extractDeferreds = new Map<number, Deferred<PdfPageText>>();

beforeEach(() => {
  vi.clearAllMocks();
  extractDeferreds.clear();

  // Default: no cache hits; extract returns non-empty paragraphs per page;
  // translate returns one result per paragraph. (loadSettings resolves to the
  // { sourceLanguage, targetLanguage } partial set in the vi.mock factory.)
  mockGetMemoryCachedPage.mockReturnValue(null);
  mockSetMemoryCachedPage.mockImplementation(() => undefined);
  mockExtractPageText.mockImplementation((_page, pageNumber) =>
    Promise.resolve(makePageText(pageNumber)),
  );
  mockTranslateParagraphs.mockImplementation((items) =>
    Promise.resolve(translateResults(items[0]?.pageNumber ?? 1)),
  );
});

describe('usePdfLookahead', () => {
  it('enqueues N+1 and N+2 after page N is translated', async () => {
    const pages = makePages(5);
    const { rerender } = renderHook(
      (props: HookProps) => usePdfLookahead(props),
      {
        initialProps: {
          pages,
          pdfUrl: 'https://example.com/a.pdf',
          translatedPages: new Set<number>(),
          enabled: true,
        },
      },
    );

    // Nothing to look ahead from yet.
    expect(mockExtractPageText).not.toHaveBeenCalled();

    await act(async () => {
      rerender({
        pages,
        pdfUrl: 'https://example.com/a.pdf',
        translatedPages: new Set<number>([1]),
        enabled: true,
      });
      await flush();
    });

    // Pages 2 and 3 were extracted and translated; results cached.
    expect(extractedPageNumbers()).toEqual(expect.arrayContaining([2, 3]));
    expect(translatedPageNumbers()).toEqual(expect.arrayContaining([2, 3]));
    const stored = storedEntries();
    expect(stored).toContainEqual({ url: 'https://example.com/a.pdf', page: 2 });
    expect(stored).toContainEqual({ url: 'https://example.com/a.pdf', page: 3 });
  });

  it('cancels in-flight look-ahead on unmount', async () => {
    const pages = makePages(3);

    mockExtractPageText.mockImplementation((_page, pageNumber) => {
      const d = deferred<PdfPageText>();
      extractDeferreds.set(pageNumber, d);
      return d.promise;
    });

    const { rerender, unmount } = renderHook(
      (props: HookProps) => usePdfLookahead(props),
      {
        initialProps: {
          pages,
          pdfUrl: 'https://example.com/a.pdf',
          translatedPages: new Set<number>(),
          enabled: true,
        },
      },
    );

    await act(async () => {
      rerender({
        pages,
        pdfUrl: 'https://example.com/a.pdf',
        translatedPages: new Set<number>([1]),
        enabled: true,
      });
      await flush();
    });
    const deferred2 = extractDeferreds.get(2);
    const deferred3 = extractDeferreds.get(3);

    // Unmount flips the cancellation token.
    unmount();

    // Resolving extraction after unmount must not translate or cache.
    await act(async () => {
      if (deferred2) deferred2.resolve(makePageText(2));
      if (deferred3) deferred3.resolve(makePageText(3));
      await flush();
    });

    expect(mockTranslateParagraphs).not.toHaveBeenCalled();
    expect(mockSetMemoryCachedPage).not.toHaveBeenCalled();
  });
});
