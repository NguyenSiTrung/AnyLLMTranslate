/**
 * usePdfDownload — Tests for the orchestration hook.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePdfDownload } from '../usePdfDownload';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { PageTranslations } from '../../lib/pdfTranslation';
import { translateAllPages } from '../../lib/translateAllPages';
import { getFont } from '../../lib/pdfFontManager';
import { generateTranslatedPdf } from '../../lib/translatedPdfGenerator';

// Mock all downstream modules
vi.mock('../../lib/translateAllPages', () => ({
  translateAllPages: vi.fn(),
}));

vi.mock('../../lib/pdfFontManager', () => ({
  getFont: vi.fn(),
}));

vi.mock('../../lib/translatedPdfGenerator', () => ({
  generateTranslatedPdf: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    sourceLanguage: 'en',
    targetLanguage: 'vi',
  }),
}));

const mockTranslateAllPages = vi.mocked(translateAllPages);
const mockGetFont = vi.mocked(getFont);
const mockGenerateTranslatedPdf = vi.mocked(generateTranslatedPdf);

function createMockPage(pageNumber: number): PDFPageProxy {
  return {
    pageNumber,
    getViewport: vi.fn().mockReturnValue({ width: 612, height: 792, scale: 1 }),
  } as unknown as PDFPageProxy;
}

function createTranslatedPage(): PageTranslations {
  return {
    paragraphs: new Map([['1-1', 'Translated text']]),
    state: 'translated',
  };
}

describe('usePdfDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful mocks
    mockTranslateAllPages.mockResolvedValue({
      translations: new Map([[1, createTranslatedPage()]]),
      failedPages: [],
      errors: new Map(),
    });

    mockGetFont.mockResolvedValue(new Uint8Array([0x00, 0x01]));

    mockGenerateTranslatedPdf.mockResolvedValue(
      new Uint8Array([0x25, 0x50, 0x44, 0x46]), // %PDF
    );

    // Mock fetch for original PDF download
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      }),
    );

    // Mock URL.createObjectURL and revokeObjectURL
    vi.stubGlobal('URL', {
      ...globalThis.URL,
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('starts in non-downloading state', () => {
    const { result } = renderHook(() =>
      usePdfDownload({
        pdfUrl: 'https://example.com/test.pdf',
        pages: [createMockPage(1)],
        translations: new Map(),
      }),
    );

    expect(result.current.isDownloading).toBe(false);
  });

  it('sets isDownloading to true on startDownload', () => {
    const { result } = renderHook(() =>
      usePdfDownload({
        pdfUrl: 'https://example.com/test.pdf',
        pages: [createMockPage(1)],
        translations: new Map(),
      }),
    );

    act(() => {
      result.current.startDownload();
    });

    expect(result.current.isDownloading).toBe(true);
  });

  it('cancel resets to non-downloading state', () => {
    const { result } = renderHook(() =>
      usePdfDownload({
        pdfUrl: 'https://example.com/test.pdf',
        pages: [createMockPage(1)],
        translations: new Map(),
      }),
    );

    act(() => {
      result.current.startDownload();
    });
    expect(result.current.isDownloading).toBe(true);

    act(() => {
      result.current.cancel();
    });
    expect(result.current.isDownloading).toBe(false);
  });

  it('reports error stage when translateAllPages has failures', async () => {
    mockTranslateAllPages.mockResolvedValue({
      translations: new Map(),
      failedPages: [2],
      errors: new Map([[2, 'LLM timeout']]),
    });

    const { result } = renderHook(() =>
      usePdfDownload({
        pdfUrl: 'https://example.com/test.pdf',
        pages: [createMockPage(1), createMockPage(2)],
        translations: new Map(),
      }),
    );

    await act(async () => {
      result.current.startDownload();
      // Allow microtasks to settle (translateAllPages is async)
      await new Promise((r) => setTimeout(r, 50));
    });

    // After pipeline settles, stage should be 'error'
    expect(result.current.stage).toBe('error');
    expect(result.current.error).toContain('page(s): 2');
  });

  it('calls generateTranslatedPdf with font bytes on success', async () => {
    const pages = [createMockPage(1)];
    const translations = new Map<number, PageTranslations>([
      [1, createTranslatedPage()],
    ]);

    mockTranslateAllPages.mockResolvedValue({
      translations,
      failedPages: [],
      errors: new Map(),
    });

    const { result } = renderHook(() =>
      usePdfDownload({
        pdfUrl: 'https://example.com/test.pdf',
        pages,
        translations,
      }),
    );

    await act(async () => {
      result.current.startDownload();
      await vi.waitFor(() => {
        expect(mockGenerateTranslatedPdf).toHaveBeenCalled();
      });
    });

    expect(mockGenerateTranslatedPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        fontBytes: expect.any(Uint8Array),
        pageTranslations: translations,
      }),
    );
  });

  describe('real page-count progress (Task 3)', () => {
    it('reports total page count (translated + untranslated) in the initial translating message', async () => {
      // 3 pages total; page 1 already translated, pages 2-3 need translation.
      const pages = [createMockPage(1), createMockPage(2), createMockPage(3)];
      const translations = new Map<number, PageTranslations>([
        [1, createTranslatedPage()],
      ]);

      // Hold translateAllPages so we can inspect the mid-flight message.
      let resolveTranslate!: (v: {
        translations: Map<number, PageTranslations>;
        failedPages: number[];
        errors: Map<number, string>;
      }) => void;
      mockTranslateAllPages.mockReturnValue(
        new Promise((r) => {
          resolveTranslate = r;
        }),
      );

      const { result } = renderHook(() =>
        usePdfDownload({ pdfUrl: 'https://example.com/test.pdf', pages, translations }),
      );

      await act(async () => {
        result.current.startDownload();
        await new Promise((r) => setTimeout(r, 10));
      });

      // Message reflects total pages (3) and the translation queue (0/2).
      expect(result.current.message).toContain('1/3');
      expect(result.current.message).toContain('(0/2)');

      // Clean up: resolve so the hook settles.
      await act(async () => {
        resolveTranslate({
          translations: new Map([
            [1, createTranslatedPage()],
            [2, createTranslatedPage()],
            [3, createTranslatedPage()],
          ]),
          failedPages: [],
          errors: new Map(),
        });
        await new Promise((r) => setTimeout(r, 10));
      });
    });

    it('skips the translation stage entirely when all pages already translated', async () => {
      const pages = [createMockPage(1), createMockPage(2)];
      const translations = new Map<number, PageTranslations>([
        [1, createTranslatedPage()],
        [2, createTranslatedPage()],
      ]);

      const { result } = renderHook(() =>
        usePdfDownload({ pdfUrl: 'https://example.com/test.pdf', pages, translations }),
      );

      await act(async () => {
        result.current.startDownload();
        // Let the whole pipeline settle.
        await new Promise((r) => setTimeout(r, 50));
      });

      // No translation work was needed — translateAllPages never called.
      expect(mockTranslateAllPages).not.toHaveBeenCalled();
      // Pipeline proceeded through to generation (font + generate both ran).
      expect(mockGenerateTranslatedPdf).toHaveBeenCalled();
    });
  });

  describe('stage-aware cancel (Task 3)', () => {
    it('cancel during translating stage aborts the translation queue', async () => {
      const pages = [createMockPage(1), createMockPage(2)];
      let rejectTranslate!: (e: Error) => void;
      mockTranslateAllPages.mockReturnValue(
        new Promise((_resolve, reject) => {
          rejectTranslate = reject;
        }),
      );

      const { result } = renderHook(() =>
        usePdfDownload({ pdfUrl: 'https://example.com/test.pdf', pages, translations: new Map() }),
      );

      await act(async () => {
        result.current.startDownload();
        await new Promise((r) => setTimeout(r, 10));
      });
      expect(result.current.stage).toBe('translating');

      act(() => {
        result.current.cancel();
      });
      expect(result.current.isDownloading).toBe(false);

      // Settle the dangling promise to avoid unhandled rejection.
      await act(async () => {
        rejectTranslate(new DOMException('Aborted', 'AbortError'));
        await new Promise((r) => setTimeout(r, 10));
      });
    });

    it('cancel during generating stage does not corrupt the in-progress generation', async () => {
      // Page 1 untranslated so translateAllPages runs (and resolves via the
      // beforeEach default mock), then we hold generateTranslatedPdf to pause
      // the pipeline mid-generation.
      const pages = [createMockPage(1)];
      let resolveGenerate!: (b: Uint8Array) => void;
      mockGenerateTranslatedPdf.mockReturnValue(
        new Promise((r) => {
          resolveGenerate = r;
        }),
      );

      const { result } = renderHook(() =>
        usePdfDownload({
          pdfUrl: 'https://example.com/test.pdf',
          pages,
          translations: new Map(),
        }),
      );

      await act(async () => {
        result.current.startDownload();
        // Poll until the pipeline reaches the generating stage. vi.waitFor
        // inside act(async) can deadlock under React 19's deferred flushing,
        // so use a manual poll with a bounded loop instead.
        for (let i = 0; i < 50; i++) {
          if (result.current.stage === 'generating') break;
          await new Promise((r) => setTimeout(r, 10));
        }
      });
      expect(result.current.stage).toBe('generating');

      // Cancel mid-generation → isDownloading flips off but generation continues.
      act(() => {
        result.current.cancel();
      });
      expect(result.current.isDownloading).toBe(false);

      // Resolve generation; the pipeline should NOT trigger a download or error.
      await act(async () => {
        resolveGenerate(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
        await new Promise((r) => setTimeout(r, 20));
      });
      // No error surfaced because the abort was graceful (signal not passed to
      // generation, so it completes without throwing AbortError).
      expect(result.current.stage).not.toBe('error');
    });
  });
});
