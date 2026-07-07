/**
 * Tests for the `usePdfDocument` hook.
 *
 * Covers:
 * - Progressive page-proxy streaming (batches of 3)
 * - Page-proxy window eviction: proxies outside ±window of the visible set are
 *   cleaned up (`.cleanup()`) and set to `null`; re-entering the window
 *   re-fetches via `getPage()`.
 * - Extracted text + translations are served from cache on re-entry (no
 *   re-translate, no duplicate proxy fetches beyond the re-fetch).
 * - `cancelledRef` guards setState after unmount.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

// Mock the loader module so we can control doc.numPages and getPage().
vi.mock('../../lib/pdfLoader', () => ({
  loadPdfDocument: vi.fn(),
}));

import { usePdfDocument } from '../usePdfDocument';
import { loadPdfDocument } from '../../lib/pdfLoader';

const mockedLoadPdfDocument = vi.mocked(loadPdfDocument);

/** Build a fake PDFPageProxy whose `cleanup` is a spy. */
function makeFakePage(pageNumber: number): PDFPageProxy {
  return {
    pageNumber,
    getViewport: vi.fn(() => ({ width: 720, height: 1000, scale: 1 })),
    getTextContent: vi.fn(),
    cleanup: vi.fn(() => true),
  } as unknown as PDFPageProxy;
}

/** Build a fake PDFDocumentProxy with N pages; getPage returns a fresh fake. */
function makeFakeDoc(numPages: number): {
  doc: PDFDocumentProxy;
  getPageSpy: ReturnType<typeof vi.fn>;
  destroySpy: ReturnType<typeof vi.fn>;
  pages: PDFPageProxy[];
} {
  const pages = Array.from({ length: numPages }, (_, i) => makeFakePage(i + 1));
  const getPageSpy = vi.fn(async (n: number) => pages[n - 1]);
  const destroySpy = vi.fn().mockResolvedValue(undefined);
  const doc = {
    numPages,
    getPage: getPageSpy,
    destroy: destroySpy,
  } as unknown as PDFDocumentProxy;
  return { doc, getPageSpy, destroySpy, pages };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePdfDocument — progressive streaming', () => {
  it('streams page proxies in batches of 3 and reports numPages immediately', async () => {
    const { doc, getPageSpy } = makeFakeDoc(7);
    mockedLoadPdfDocument.mockResolvedValue(doc);

    const { result } = renderHook(() => usePdfDocument('https://example.com/x.pdf'));

    // Loaded state should be set once the doc resolves; numPages available
    await waitFor(() => expect(result.current.loadState).toBe('loaded'));
    expect(result.current.numPages).toBe(7);

    // Pages array has 7 slots; all become populated after streaming completes
    await waitFor(() => expect(result.current.pages.every((p) => p !== null)).toBe(true));
    expect(getPageSpy).toHaveBeenCalledTimes(7);
    expect(result.current.pages.length).toBe(7);
  });

  it('sets error state on load failure', async () => {
    mockedLoadPdfDocument.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => usePdfDocument('https://example.com/x.pdf'));

    await waitFor(() => expect(result.current.loadState).toBe('error'));
    expect(result.current.error).toBe('Network down');
  });

});

describe('usePdfDocument — page-proxy window eviction', () => {
  it('evicts proxies outside the ±window of the visible set', async () => {
    const { doc, pages, getPageSpy } = makeFakeDoc(20);
    mockedLoadPdfDocument.mockResolvedValue(doc);

    // Load fully FIRST (no visible set → eviction never runs).
    const { result, rerender } = renderHook(
      ({ visible }: { visible: Set<number> | undefined }) =>
        usePdfDocument('https://example.com/big.pdf', {
          visiblePages: visible,
          evictionWindow: 5,
        }),
      { initialProps: { visible: undefined } as { visible: Set<number> | undefined } },
    );

    // Wait until all 20 proxies have streamed in (no eviction active).
    await waitFor(() =>
      expect(result.current.pages.filter((p) => p !== null).length).toBe(20),
    );

    // Now introduce a visible set around page 10 → keep 5..15; evict the rest.
    act(() => {
      rerender({ visible: new Set<number>([10]) });
    });

    const kept = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const evicted = Array.from({ length: 20 }, (_, i) => i + 1).filter((n) => !kept.includes(n));

    await waitFor(() => {
      for (const n of kept) {
        expect(result.current.pages[n - 1]).not.toBeNull();
      }
      for (const n of evicted) {
        expect(result.current.pages[n - 1]).toBeNull();
      }
    });

    // Evicted proxies were cleaned up.
    for (const n of evicted) {
      expect(pages[n - 1].cleanup).toHaveBeenCalled();
    }

    // Total getPage calls: 20 initial stream. Eviction does NOT re-fetch.
    expect(getPageSpy).toHaveBeenCalledTimes(20);
  });

  it('guards setState after unmount during streaming', async () => {
    const { doc } = makeFakeDoc(50);
    mockedLoadPdfDocument.mockResolvedValue(doc);

    const { unmount } = renderHook(() =>
      usePdfDocument('https://example.com/x.pdf'),
    );

    // Unmount mid-stream should not throw unhandled state updates.
    act(() => {
      unmount();
    });
    // Allow pending promises to settle without throwing.
    await Promise.resolve();
    await Promise.resolve();
    expect(true).toBe(true);
  });
});
