/**
 * Tests for PDF page translation viewport wiring.
 *
 * The regression this protects against: if the IntersectionObserver root is
 * set to the inner content wrapper instead of the actual scroll pane, every
 * page slot appears visible and the viewer starts translating the whole PDF.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';

// Mock the translation + extraction + config imports so we can drive the
// per-paragraph status lifecycle deterministically.
vi.mock('../../lib/pdfTranslation', () => ({
  translateParagraphs: vi.fn(),
  getMemoryCachedPage: vi.fn(() => null),
  setMemoryCachedPage: vi.fn(),
}));
vi.mock('../../lib/pdfTextExtraction', () => ({
  extractPageText: vi.fn(),
}));
vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    sourceLanguage: 'en',
    targetLanguage: 'vi',
    providers: [{ id: 'p1', baseUrl: 'https://api.x.com', model: 'gpt-4' }],
  }),
}));
vi.mock('../../lib/pdfProgressStore', () => ({
  computeContextHash: vi.fn((ctx: { pdfUrl: string }) => `hash-${ctx.pdfUrl}`),
  loadPdfProgress: vi.fn().mockResolvedValue(null),
  savePdfProgress: vi.fn().mockResolvedValue(undefined),
}));

import { usePdfPageTranslations } from '../usePdfPageTranslations';
import { translateParagraphs } from '../../lib/pdfTranslation';
import { extractPageText } from '../../lib/pdfTextExtraction';
import { loadPdfProgress, savePdfProgress } from '../../lib/pdfProgressStore';

const mockedTranslateParagraphs = vi.mocked(translateParagraphs);
const mockedExtractPageText = vi.mocked(extractPageText);
const mockedLoadPdfProgress = vi.mocked(loadPdfProgress);
const mockedSavePdfProgress = vi.mocked(savePdfProgress);

const observerInstances: Array<{ options?: IntersectionObserverInit; observe: ReturnType<typeof vi.fn> }> = [];
const OriginalIntersectionObserver = globalThis.IntersectionObserver;

beforeEach(() => {
  vi.clearAllMocks();
  observerInstances.length = 0;
  // Default mocks so the observer tests' async paths don't throw.
  mockedExtractPageText.mockResolvedValue({ pageNumber: 1, paragraphs: [] });
  mockedTranslateParagraphs.mockResolvedValue([]);
  globalThis.IntersectionObserver = vi.fn((callback: IntersectionObserverCallback, options?: IntersectionObserverInit) => {
    void callback;
    const instance = {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
      takeRecords: vi.fn(() => []),
      root: options?.root ?? null,
      rootMargin: options?.rootMargin ?? '',
      thresholds: [],
      options,
    };
    observerInstances.push(instance);
    return instance;
  }) as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  globalThis.IntersectionObserver = OriginalIntersectionObserver;
  document.body.innerHTML = '';
});

describe('usePdfPageTranslations', () => {
  /** Set up a scroll pane + content wrapper with N page slots in the DOM. */
  function setupSlots(pageCount: number): { scrollPane: HTMLElement; contentWrapper: HTMLElement } {
    const scrollPane = document.createElement('div');
    scrollPane.setAttribute('data-pane', 'right');
    const contentWrapper = document.createElement('div');
    for (let i = 1; i <= pageCount; i++) {
      const slot = document.createElement('div');
      slot.setAttribute('data-page-slot', String(i));
      contentWrapper.appendChild(slot);
    }
    scrollPane.appendChild(contentWrapper);
    document.body.appendChild(scrollPane);
    return { scrollPane, contentWrapper };
  }

  /** Capture the IntersectionObserver callback from the first instance and
   *  fire an intersection event for the given page slot. Avoids non-null
   *  assertions by validating existence up-front. */
  function fireIntersection(pageSlot: number): void {
    const cb = (globalThis.IntersectionObserver as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as IntersectionObserverCallback;
    const target = document.querySelector(`[data-page-slot="${pageSlot}"]`);
    if (!target) throw new Error(`page slot ${pageSlot} not found`);
    act(() => {
      cb(
        [{ target, isIntersecting: true } as unknown as IntersectionObserverEntry],
        {} as unknown as IntersectionObserver,
      );
    });
  }

  describe('per-paragraph translationStatus (Phase 2)', () => {
    it('marks each paragraph success independently when translation completes', async () => {
      setupSlots(1);
      mockedExtractPageText.mockResolvedValue({
        pageNumber: 1,
        paragraphs: [
          { id: 'p1', text: 'Hello', x: 0, y: 0, width: 100, height: 10, fontSize: 10, isHeading: false },
          { id: 'p2', text: 'World', x: 0, y: 20, width: 100, height: 10, fontSize: 10, isHeading: false },
        ],
      });
      mockedTranslateParagraphs.mockResolvedValue([
        { id: 'p1', translatedText: 'Xin chào' },
        { id: 'p2', translatedText: 'Thế giới' },
      ]);

      const stablePages = [{} as PDFPageProxy];
      const { result } = renderHook(() => {
        const containerRef = useRef<HTMLElement | null>(document.querySelector('[data-pane="right"] > div'));
        return usePdfPageTranslations({
          pages: stablePages,
          numPages: 1,
          pdfUrl: 'https://example.com/file.pdf',
          containerRef,
        });
      });

      fireIntersection(1);

      await waitFor(() => {
        expect(result.current.pages.get(1)?.state).toBe('translated');
      });

      const page = result.current.pages.get(1);
      expect(page?.paragraphStatus?.get('p1')).toBe('success');
      expect(page?.paragraphStatus?.get('p2')).toBe('success');
    });

    it('fills paragraphs incrementally via onPiece during streaming (Phase 2 Task 3)', async () => {
      setupSlots(1);
      // Explicitly reset mocks to avoid interference from beforeEach defaults
      mockedExtractPageText.mockReset();
      mockedTranslateParagraphs.mockReset();
      mockedExtractPageText.mockResolvedValue({
        pageNumber: 1,
        paragraphs: [
          { id: 'p1', text: 'Hello', x: 0, y: 0, width: 100, height: 10, fontSize: 10, isHeading: false },
          { id: 'p2', text: 'World', x: 0, y: 20, width: 100, height: 10, fontSize: 10, isHeading: false },
        ],
      });
      // Ensure cache miss so the translate path is taken
      const { getMemoryCachedPage } = await import('../../lib/pdfTranslation');
      vi.mocked(getMemoryCachedPage).mockReturnValue(null);

      // Capture the onPiece callback from translateParagraphs and hold the
      // promise so we can verify the intermediate state before completion.
      let capturedOnPiece: ((id: string, text: string) => void) | undefined;
      let resolveTranslate: (() => void) | undefined;
      const translateHold = new Promise<void>((resolve) => {
        resolveTranslate = resolve;
      });

      mockedTranslateParagraphs.mockImplementation(
        async (
          _paragraphs: unknown,
          _pdfUrl: string,
          onPiece?: (id: string, text: string) => void,
        ) => {
          capturedOnPiece = onPiece;
          await translateHold;
          return [
            { id: 'p1', translatedText: 'Xin chào' },
            { id: 'p2', translatedText: 'Thế giới' },
          ];
        },
      );

      const stablePages = [{} as PDFPageProxy];
      const { result } = renderHook(() => {
        const containerRef = useRef<HTMLElement | null>(document.querySelector('[data-pane="right"] > div'));
        return usePdfPageTranslations({
          pages: stablePages,
          numPages: 1,
          pdfUrl: 'https://example.com/file.pdf',
          containerRef,
        });
      });

      // Get the observer callback and fire intersection inside a single
      // async act() with a flush, so the IIFE's microtasks run within scope.
      await act(async () => {
        fireIntersection(1);
        // Flush microtasks so the IIFE reaches translateParagraphs → hold
        await new Promise((r) => setTimeout(r, 50));
      });

      // Verify the page is in 'translating' state with both paragraphs pending
      await waitFor(() => {
        expect(result.current.pages.get(1)?.state).toBe('translating');
      });
      expect(result.current.pages.get(1)?.paragraphStatus?.get('p1')).toBe('translating');
      expect(result.current.pages.get(1)?.paragraphStatus?.get('p2')).toBe('translating');

      // Simulate streaming: call onPiece for p1 (as the background would)
      expect(capturedOnPiece).toBeDefined();
      await act(async () => {
        capturedOnPiece?.('p1', 'Xin chào');
      });

      // p1 should now be filled with 'success' status; p2 still 'translating'
      const intermediatePage = result.current.pages.get(1);
      expect(intermediatePage?.state).toBe('translating');
      expect(intermediatePage?.paragraphs.get('p1')).toBe('Xin chào');
      expect(intermediatePage?.paragraphStatus?.get('p1')).toBe('success');
      expect(intermediatePage?.paragraphStatus?.get('p2')).toBe('translating');
      expect(intermediatePage?.paragraphs.has('p2')).toBe(false);

      // Release the hold to let translateParagraphs complete with final results
      await act(async () => {
        if (resolveTranslate) resolveTranslate();
        await new Promise((r) => setTimeout(r, 50));
      });

      // After full completion, both paragraphs are filled
      await waitFor(() => {
        expect(result.current.pages.get(1)?.state).toBe('translated');
      });

      const finalPage = result.current.pages.get(1);
      expect(finalPage?.paragraphs.get('p1')).toBe('Xin chào');
      expect(finalPage?.paragraphs.get('p2')).toBe('Thế giới');
      expect(finalPage?.paragraphStatus?.get('p1')).toBe('success');
      expect(finalPage?.paragraphStatus?.get('p2')).toBe('success');
    });
  });

  describe('progress persistence (Phase 6 Task 1)', () => {
    it('persists terminal page states via savePdfProgress write-through', async () => {
      setupSlots(1);
      mockedExtractPageText.mockResolvedValue({
        pageNumber: 1,
        paragraphs: [{ id: 'p1', text: 'Hello', x: 0, y: 0, width: 100, height: 10, fontSize: 10, isHeading: false }],
      });
      mockedTranslateParagraphs.mockResolvedValue([{ id: 'p1', translatedText: 'Xin chào' }]);

      const stablePages = [{} as PDFPageProxy];
      const { result } = renderHook(() => {
        const containerRef = useRef<HTMLElement | null>(document.querySelector('[data-pane="right"] > div'));
        return usePdfPageTranslations({
          pages: stablePages,
          numPages: 1,
          pdfUrl: 'https://example.com/persist.pdf',
          containerRef,
        });
      });

      fireIntersection(1);
      await waitFor(() => {
        expect(result.current.pages.get(1)?.state).toBe('translated');
      });

      // Write-through fires after terminal state is reached + hydration completed.
      await waitFor(() => {
        expect(mockedSavePdfProgress).toHaveBeenCalled();
      });
      // The persisted map includes the translated page.
      const savedArg = mockedSavePdfProgress.mock.calls[mockedSavePdfProgress.mock.calls.length - 1];
      expect(savedArg[0]).toBe('hash-https://example.com/persist.pdf');
      expect(savedArg[1].get(1)?.state).toBe('translated');
    });

  });
});
