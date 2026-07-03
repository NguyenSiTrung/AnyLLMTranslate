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

  it('respects a custom lookAheadRange of 1 (only N+1)', async () => {
    const pages = makePages(5);
    const { rerender } = renderHook(
      (props: HookProps) => usePdfLookahead(props),
      {
        initialProps: {
          pages,
          pdfUrl: 'https://example.com/a.pdf',
          translatedPages: new Set<number>(),
          lookAheadRange: 1,
          enabled: true,
        },
      },
    );

    await act(async () => {
      rerender({
        pages,
        pdfUrl: 'https://example.com/a.pdf',
        translatedPages: new Set<number>([1]),
        lookAheadRange: 1,
        enabled: true,
      });
      await flush();
    });

    expect(extractedPageNumbers()).toEqual([2]);
    expect(translatedPageNumbers()).toEqual([2]);
  });

  it('yields when the viewport hook translates a look-ahead page first', async () => {
    // 3-page document so source page 2 only targets page 3 (page 4 out of range).
    const pages = makePages(3);

    // Controlled extraction so we can resolve after simulating visible work.
    mockExtractPageText.mockImplementation((_page, pageNumber) => {
      const d = deferred<PdfPageText>();
      extractDeferreds.set(pageNumber, d);
      return d.promise;
    });

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

    // Page 1 finishes → enqueue look-ahead for 2 and 3 (both pending on extract).
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

    // Visible work preempts page 2: the viewport hook translates it first.
    await act(async () => {
      rerender({
        pages,
        pdfUrl: 'https://example.com/a.pdf',
        translatedPages: new Set<number>([1, 2]),
        enabled: true,
      });
      await flush();
    });

    // Resolving page 2's extraction should NOT trigger translation (yield).
    await act(async () => {
      if (deferred2) deferred2.resolve(makePageText(2));
      await flush();
    });

    // Page 3 is still pending visible work → look-ahead completes it.
    await act(async () => {
      if (deferred3) deferred3.resolve(makePageText(3));
      await flush();
    });

    expect(translatedPageNumbers()).not.toContain(2);
    expect(translatedPageNumbers()).toContain(3);
    const stored = storedEntries();
    expect(stored).not.toContainEqual({ url: 'https://example.com/a.pdf', page: 2 });
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

  it('cancels in-flight look-ahead on pdfUrl change', async () => {
    const pages = makePages(2);

    mockExtractPageText.mockImplementation((_page, pageNumber) => {
      const d = deferred<PdfPageText>();
      extractDeferreds.set(pageNumber, d);
      return d.promise;
    });

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

    // Trigger look-ahead under url 'a' (only page 2 is in range for a 2-page doc).
    await act(async () => {
      rerender({
        pages,
        pdfUrl: 'https://example.com/a.pdf',
        translatedPages: new Set<number>([1]),
        enabled: true,
      });
      await flush();
    });
    const deferredA = extractDeferreds.get(2);

    // Document changes → old token cancelled, fresh look-ahead starts for 'b'.
    await act(async () => {
      rerender({
        pages,
        pdfUrl: 'https://example.com/b.pdf',
        translatedPages: new Set<number>([1]),
        enabled: true,
      });
      await flush();
    });
    const deferredB = extractDeferreds.get(2);

    // Resolve the OLD document's extraction → must bail (cancelled token).
    await act(async () => {
      if (deferredA) deferredA.resolve(makePageText(2));
      await flush();
    });
    expect(storedEntries()).not.toContainEqual({ url: 'https://example.com/a.pdf', page: 2 });

    // Resolve the NEW document's extraction → completes and caches under 'b'.
    await act(async () => {
      if (deferredB) deferredB.resolve(makePageText(2));
      await flush();
    });
    expect(storedEntries()).toContainEqual({ url: 'https://example.com/b.pdf', page: 2 });
    expect(storedEntries()).not.toContainEqual({ url: 'https://example.com/a.pdf', page: 2 });
  });

  it('does not re-queue pages already in the in-memory cache', async () => {
    const pages = makePages(5);

    // Page 2 is already cached → look-ahead should skip extract + translate.
    mockGetMemoryCachedPage.mockImplementation((_url, pageNumber) => {
      if (pageNumber === 2) return new Map<string, string>([['2-0', 'cached']]);
      return null;
    });

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

    await act(async () => {
      rerender({
        pages,
        pdfUrl: 'https://example.com/a.pdf',
        translatedPages: new Set<number>([1]),
        enabled: true,
      });
      await flush();
    });

    // Page 2: cache hit → no extract, no translate, no store.
    expect(extractedPageNumbers()).not.toContain(2);
    expect(translatedPageNumbers()).not.toContain(2);
    expect(storedEntries()).not.toContainEqual({ url: 'https://example.com/a.pdf', page: 2 });

    // Page 3: no cache → fully translated and cached.
    expect(extractedPageNumbers()).toContain(3);
    expect(translatedPageNumbers()).toContain(3);
    expect(storedEntries()).toContainEqual({ url: 'https://example.com/a.pdf', page: 3 });
  });

  it('skips look-ahead targets outside the valid page range', async () => {
    // 2-page document: page 1 → targets 2 (valid) and 3 (out of range).
    const pages = makePages(2);
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

    await act(async () => {
      rerender({
        pages,
        pdfUrl: 'https://example.com/a.pdf',
        translatedPages: new Set<number>([1]),
        enabled: true,
      });
      await flush();
    });

    expect(extractedPageNumbers()).toEqual([2]);
    expect(translatedPageNumbers()).toEqual([2]);
    // Page 3 is out of range and was never touched.
    expect(extractedPageNumbers()).not.toContain(3);
  });

  it('skips everything when the last page is the source (no valid targets)', async () => {
    const pages = makePages(2);
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

    await act(async () => {
      rerender({
        pages,
        pdfUrl: 'https://example.com/a.pdf',
        translatedPages: new Set<number>([2]),
        enabled: true,
      });
      await flush();
    });

    // Page 2 → targets 3 and 4, both out of range.
    expect(mockExtractPageText).not.toHaveBeenCalled();
    expect(mockTranslateParagraphs).not.toHaveBeenCalled();
  });

  it('does nothing when enabled is false', async () => {
    const pages = makePages(5);
    const { rerender } = renderHook(
      (props: HookProps) => usePdfLookahead(props),
      {
        initialProps: {
          pages,
          pdfUrl: 'https://example.com/a.pdf',
          translatedPages: new Set<number>(),
          enabled: false,
        },
      },
    );

    await act(async () => {
      rerender({
        pages,
        pdfUrl: 'https://example.com/a.pdf',
        translatedPages: new Set<number>([1]),
        enabled: false,
      });
      await flush();
    });

    expect(mockExtractPageText).not.toHaveBeenCalled();
    expect(mockTranslateParagraphs).not.toHaveBeenCalled();
    expect(mockSetMemoryCachedPage).not.toHaveBeenCalled();
  });

  it('catches translation errors silently (best-effort)', async () => {
    const pages = makePages(3);
    mockTranslateParagraphs.mockRejectedValue(new Error('LLM down'));

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

    await act(async () => {
      rerender({
        pages,
        pdfUrl: 'https://example.com/a.pdf',
        translatedPages: new Set<number>([1]),
        enabled: true,
      });
      await flush();
    });

    // Look-ahead attempted translation but swallowed the error.
    expect(mockTranslateParagraphs).toHaveBeenCalled();
    expect(mockSetMemoryCachedPage).not.toHaveBeenCalled();
  });
});
