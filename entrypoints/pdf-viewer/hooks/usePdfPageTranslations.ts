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
  type ParagraphTranslationStatus,
  PdfTranslationError,
  translateParagraphs,
  getMemoryCachedPage,
  setMemoryCachedPage,
} from '../lib/pdfTranslation';
import { extractPageText, type PdfParagraph } from '../lib/pdfTextExtraction';
import { loadSettings } from '@/lib/config';
import {
  computeContextHash,
  loadPdfProgress,
  savePdfProgress,
  type PdfProgressContext,
} from '../lib/pdfProgressStore';

export interface UsePdfPageTranslationsOptions {
  /** Loaded PDF pages, in page order. May contain fewer entries than
   *  `numPages` because page proxies are evicted outside the viewport window
   *  (memory management). Use `numPages` for the true document total. */
  pages: PDFPageProxy[];
  /** Total number of pages in the document (stable once loaded). Used for the
   *  progress indicator so eviction/re-fetch of page proxies does not change
   *  the reported total. */
  numPages: number;
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

/** Extract text and translate a single page. Updates `setPages` as it progresses.
 *  Per-paragraph status (Phase 2): all paragraphs start 'translating', then
 *  transition to 'success' as results arrive (or 'error' if the page fails). */
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
        next.set(pageNumber, {
          paragraphs: new Map(),
          originalParagraphs: [],
          paragraphStatus: new Map(),
          state: 'translated',
        });
        return next;
      });
      return;
    }
    // All paragraphs start as 'translating'.
    const statusMap = new Map<string, ParagraphTranslationStatus>(
      paragraphs.map((p) => [p.id, 'translating']),
    );
    setPages((prev) => {
      const next = new Map(prev);
      next.set(pageNumber, {
        paragraphs: new Map(),
        originalParagraphs: paragraphs,
        paragraphStatus: statusMap,
        state: 'translating',
      });
      return next;
    });

    // Stream piece deltas into state incrementally (Phase 2). Each callback
    // updates the individual paragraph + its status so the UI fills in
    // one-by-one. The final result overwrites with the authoritative map.
    const onPiece = (id: string, text: string): void => {
      statusMap.set(id, 'success');
      setPages((prev) => {
        const existing = prev.get(pageNumber);
        if (!existing || existing.state !== 'translating') return prev; // page superseded/errored
        const updatedParagraphs = new Map(existing.paragraphs);
        updatedParagraphs.set(id, text);
        const next = new Map(prev);
        next.set(pageNumber, {
          ...existing,
          paragraphs: updatedParagraphs,
          paragraphStatus: new Map(statusMap),
        });
        return next;
      });
    };

    const results = await translateParagraphs(
      paragraphs.map((paragraph) => ({ pageNumber, paragraph })),
      pdfUrl,
      onPiece,
    );
    const paragraphMap = new Map<string, string>();
    for (const { id, translatedText } of results) {
      paragraphMap.set(id, translatedText);
      statusMap.set(id, 'success');
    }
    setPages((prev) => {
      const next = new Map(prev);
      next.set(pageNumber, {
        paragraphs: paragraphMap,
        originalParagraphs: paragraphs,
        paragraphStatus: new Map(statusMap),
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
    const retryAfter =
      err instanceof PdfTranslationError ? err.retryAfter : undefined;
    setPages((prev) => {
      const next = new Map(prev);
      // Mark any in-flight paragraphs as 'error' (page-level error).
      const existing = prev.get(pageNumber);
      const statusMap = existing?.paragraphStatus
        ? new Map(existing.paragraphStatus)
        : new Map<string, ParagraphTranslationStatus>();
      for (const [id, status] of statusMap) {
        if (status === 'translating') statusMap.set(id, 'error');
      }
      next.set(pageNumber, {
        paragraphs: new Map(),
        paragraphStatus: statusMap,
        state: 'error',
        error: message,
        ...(retryAfter !== undefined ? { retryAfter } : {}),
      });
      return next;
    });
  }
}

export function usePdfPageTranslations({
  pages: pdfPages,
  numPages,
  pdfUrl,
  containerRef,
  rootMargin = '200px 0px',
}: UsePdfPageTranslationsOptions): UsePdfPageTranslationsResult {
  const [pages, setPages] = useState<Map<number, PageTranslations>>(new Map());
  const pagesRef = useRef(pages);
  useEffect(() => { pagesRef.current = pages; }, [pages]);
  // Track latest pdfPages in a ref so the IntersectionObserver callback
  // always sees fresh page proxies without re-creating the observer.
  const pdfPagesRef = useRef(pdfPages);
  useEffect(() => { pdfPagesRef.current = pdfPages; }, [pdfPages]);
  // Stable per-page translator references so retry triggers re-extract the same page
  const inFlightRef = useRef<Set<number>>(new Set());
  // Context hash for progress persistence (null until resolved). Stored in a
  // ref so write-through reads it without re-running the hydrate effect.
  const progressHashRef = useRef<string | null>(null);
  // Hydration guard: prevents write-through from racing ahead of the initial
  // load (which would clobber hydrated state with an empty Map).
  const hydratedRef = useRef(false);

  // Resolve the active provider identity for the progress context hash.
  // Uses the first pool provider's baseUrl + model + preset — sufficient for
  // invalidation when the user switches provider/model.
  async function resolveProgressContext(): Promise<PdfProgressContext | null> {
    try {
      const settings = await loadSettings();
      const active = settings.providers?.[0];
      return {
        pdfUrl,
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
        provider: active ? `${active.id}@${active.baseUrl}` : 'unknown',
        model: active?.model ?? 'unknown',
      };
    } catch {
      return null;
    }
  }

  // Hydrate persisted progress on mount / document change. Seeds the pages
  // Map so a reopened PDF renders instantly from stored state. Falls back to
  // an empty Map (re-translate) when nothing is stored or the hash mismatches.
  useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;
    (async () => {
      const ctx = await resolveProgressContext();
      if (!ctx || cancelled) {
        progressHashRef.current = null;
        return;
      }
      const hash = computeContextHash(ctx);
      progressHashRef.current = hash;
      const stored = await loadPdfProgress(hash);
      if (cancelled || !stored || stored.size === 0) return;
      // Only seed pages that aren't already populated (defensive against a
      // fast cache-hit from the viewport path running concurrently).
      setPages((prev) => {
        const next = new Map(prev);
        for (const [pageNumber, page] of stored) {
          if (!next.has(pageNumber)) next.set(pageNumber, page);
        }
        return next;
      });
    })().finally(() => {
      if (!cancelled) hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  // Write-through: persist terminal page states (debounced). Skips the
  // initial hydration window so we don't overwrite stored progress before
  // it loads. A module-level timer dedupes rapid successive updates.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const hash = progressHashRef.current;
    if (!hash) return;
    const terminalPages = new Map<number, PageTranslations>();
    let hasTerminal = false;
    for (const [pageNumber, page] of pages) {
      if (page.state === 'translated' || page.state === 'error') {
        terminalPages.set(pageNumber, page);
        hasTerminal = true;
      }
    }
    if (!hasTerminal) return;
    // Best-effort write; failures are non-fatal (progress persistence is a
    // perceived-speed optimization, not a correctness requirement).
    void savePdfProgress(hash, terminalPages);
  }, [pages]);

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

    // Re-query slots inside the effect — avoids depending on the array reference
    // which would tear down and recreate the IntersectionObserver on every render.
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
              const page = pdfPagesRef.current[pageNumber - 1];
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
                // Cache hit: all cached paragraphs are 'success'.
                const statusMap = new Map<string, ParagraphTranslationStatus>(
                  Array.from(cached.keys()).map((id) => [id, 'success' as const]),
                );
                next.set(pageNumber, {
                  paragraphs: cached,
                  originalParagraphs,
                  paragraphStatus: statusMap,
                  state: 'translated',
                });
                return next;
              });
              inFlightRef.current.delete(pageNumber);
              return;
            }

            const page = pdfPagesRef.current[pageNumber - 1];
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
  }, [pdfPages.length, pdfUrl, containerRef, rootMargin]);

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

  return { pages, translatedCount, totalCount: numPages, retryPage };
}
