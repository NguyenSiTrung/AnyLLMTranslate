/**
 * usePdfPageTranslations — Orchestrates per-page translation via viewport
 * intersection. Pages that scroll into view are extracted (text) and translated
 * (via the background script), then stored in component state and re-rendered
 * in the right pane.
 *
 * Why viewport-based?
 * - Sending one LLM request per page on mount wastes tokens for documents the
 *   user never scrolls to. We translate pages lazily as they become visible.
 * - The semantics mirror the rest of the extension's `ViewportObserver` so
 *   existing users get a familiar progressive-translation experience.
 */

import { useEffect, useRef, useState } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';
import {
  type PageTranslations,
  translateParagraphs,
  getMemoryCachedPage,
  setMemoryCachedPage,
} from '../lib/pdfTranslation';
import { extractPageText, type PdfParagraph } from '../lib/pdfTextExtraction';
import { loadSettings } from '@/lib/config';

export interface UsePdfPageTranslationsOptions {
  /** Loaded PDF pages, in page order. */
  pages: PDFPageProxy[];
  /** PDF source URL — used as a stable identifier for in-memory cache. */
  pdfUrl: string;
  /** Container element that holds the right-pane slots. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** How much vertical slack counts as "visible" (px). Defaults to 200. */
  rootMargin?: string;
}

export interface UsePdfPageTranslationsResult {
  /** Per-page translation state, keyed by 1-indexed page number. */
  pages: Map<number, PageTranslations>;
  /** Number of pages that have finished translating. */
  translatedCount: number;
  /** Total number of pages. */
  totalCount: number;
  /** Force a re-translation of a specific page. */
  retryPage: (pageNumber: number) => void;
}

/** Extract text and translate a single page. Updates `setPages` as it progresses. */
async function translatePage(
  page: PDFPageProxy,
  pageNumber: number,
  pdfUrl: string,
  setPages: React.Dispatch<React.SetStateAction<Map<number, PageTranslations>>>,
): Promise<void> {
  setPages((prev) => {
    const next = new Map(prev);
    next.set(pageNumber, { paragraphs: new Map(), state: 'translating' });
    return next;
  });

  try {
    const { paragraphs } = await extractPageText(page, pageNumber);
    if (paragraphs.length === 0) {
      setPages((prev) => {
        const next = new Map(prev);
        next.set(pageNumber, { paragraphs: new Map(), originalParagraphs: [], state: 'translated' });
        return next;
      });
      return;
    }
    const results = await translateParagraphs(
      paragraphs.map((paragraph) => ({ pageNumber, paragraph })),
      pdfUrl,
    );
    const paragraphMap = new Map<string, string>();
    const paragraphKinds = new Map<string, 'prose' | 'math' | 'figure'>();
    for (const { id, translatedText, kind } of results) {
      paragraphMap.set(id, translatedText);
      if (kind) paragraphKinds.set(id, kind);
    }
    setPages((prev) => {
      const next = new Map(prev);
      next.set(pageNumber, {
        paragraphs: paragraphMap,
        paragraphKinds,
        originalParagraphs: paragraphs,
        state: 'translated',
      });
      return next;
    });
    const settings = await loadSettings();
    setMemoryCachedPage(
      pdfUrl,
      pageNumber,
      paragraphMap,
      settings.sourceLanguage,
      settings.targetLanguage,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Translation failed';
    setPages((prev) => {
      const next = new Map(prev);
      next.set(pageNumber, { paragraphs: new Map(), state: 'error', error: message });
      return next;
    });
  }
}

export function usePdfPageTranslations({
  pages: pdfPages,
  pdfUrl,
  containerRef,
  rootMargin = '200px 0px',
}: UsePdfPageTranslationsOptions): UsePdfPageTranslationsResult {
  const [pages, setPages] = useState<Map<number, PageTranslations>>(new Map());
  const pagesRef = useRef(pages);
  useEffect(() => { pagesRef.current = pages; }, [pages]);
  // Stable per-page translator references so retry triggers re-extract the same page
  const inFlightRef = useRef<Set<number>>(new Set());

  // Reset state when the document changes
  useEffect(() => {
    setPages(new Map());
    inFlightRef.current = new Set();
  }, [pdfUrl, pdfPages.length]);

  useEffect(() => {
    if (pdfPages.length === 0) return;
    const container = containerRef.current;
    if (!container) return;
    const scrollRoot = container.closest('[data-pane="right"]') as HTMLElement | null;

    // Each page should have a slot in the right pane — observe them
    const slots: Element[] = Array.from(container.querySelectorAll('[data-page-slot]'));
    if (slots.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const pageNumber = Number(entry.target.getAttribute('data-page-slot'));
          if (!Number.isFinite(pageNumber)) continue;
          if (inFlightRef.current.has(pageNumber)) continue;

          // Already in a terminal state? Skip — no need to re-translate
          const existing = pagesRef.current.get(pageNumber);
          if (existing && (existing.state === 'translated' || existing.state === 'translating')) continue;

          inFlightRef.current.add(pageNumber);
          observer.unobserve(entry.target);

          // Check in-memory cache first
          void (async () => {
            const settings = await loadSettings();
            const cached = getMemoryCachedPage(
              pdfUrl,
              pageNumber,
              settings.sourceLanguage,
              settings.targetLanguage,
            );
            if (cached) {
              const page = pdfPages[pageNumber - 1];
              let originalParagraphs: PdfParagraph[] = [];
              if (page) {
                try {
                  const res = await extractPageText(page, pageNumber);
                  originalParagraphs = res.paragraphs;
                } catch {
                  // Fallback when extraction fails
                }
              }
              setPages((prev) => {
                const next = new Map(prev);
                next.set(pageNumber, {
                  paragraphs: cached,
                  originalParagraphs,
                  state: 'translated',
                });
                return next;
              });
              inFlightRef.current.delete(pageNumber);
              return;
            }

            const page = pdfPages[pageNumber - 1];
            if (!page) {
              inFlightRef.current.delete(pageNumber);
              return;
            }
            await translatePage(page, pageNumber, pdfUrl, setPages);
            inFlightRef.current.delete(pageNumber);
          })();
        }
      },
      { root: scrollRoot ?? container.parentElement ?? container, rootMargin, threshold: 0.01 },
    );

    for (const slot of slots) {
      observer.observe(slot);
    }

    return () => {
      observer.disconnect();
    };
  }, [pdfPages, pdfUrl, containerRef, rootMargin]);

  const translatedCount = Array.from(pages.values()).filter((p) => p.state === 'translated').length;

  const retryPage = (pageNumber: number): void => {
    setPages((prev) => {
      const next = new Map(prev);
      next.delete(pageNumber);
      return next;
    });
    inFlightRef.current.delete(pageNumber);
    const page = pdfPages[pageNumber - 1];
    if (!page) return;
    inFlightRef.current.add(pageNumber);
    void translatePage(page, pageNumber, pdfUrl, setPages).then(() => {
      inFlightRef.current.delete(pageNumber);
    });
  };

  return { pages, translatedCount, totalCount: pdfPages.length, retryPage };
}
