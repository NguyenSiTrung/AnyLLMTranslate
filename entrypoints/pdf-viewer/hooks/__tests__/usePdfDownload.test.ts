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
  });
});
