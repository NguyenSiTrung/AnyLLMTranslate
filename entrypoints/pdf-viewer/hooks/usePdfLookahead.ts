/**
 * usePdfLookahead — Low-priority 2-page look-ahead pre-translation.
 *
 * Once a page finishes translating (appears in `translatedPages`), this hook
 * enqueues extraction + translation for the next `lookAheadRange` pages
 * (default 2: N+1, N+2). Results are written to the in-memory page cache via
 * `setMemoryCachedPage` so the viewport-driven `usePdfPageTranslations` hook
 * serves them instantly when the user scrolls to them — no second LLM call.
 *
 * Priority yielding:
 * - The actual LLM concurrency is bounded by the background service worker's
 *   dedicated PDF semaphore (max 2 concurrent), reached via `translateParagraphs`
 *   → `chrome.runtime.sendMessage`. The look-ahead calls the same
 *   `translateParagraphs`, so it shares that semaphore queue with visible-page
 *   work rather than opening a competing channel.
 * - "Low priority" is enforced client-side: the hook defers to the viewport
 *   hook by re-checking `translatedPages` after every `await`. If the user
 *   scrolls to a look-ahead target and the viewport hook translates it first,
 *   the look-ahead abandons its in-flight work for that page (yields) instead
 *   of performing a redundant translation.
 *
 * Cancellation:
 * - A fresh cancellation token is created per `pdfUrl` lifecycle. On unmount
 *   or document change the previous token is flipped, so any in-flight
 *   look-ahead bails out at its next await checkpoint without touching state.
 */

import { useEffect, useRef } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';
import {
  translateParagraphs,
  getMemoryCachedPage,
  setMemoryCachedPage,
} from '../lib/pdfTranslation';
import { extractPageText } from '../lib/pdfTextExtraction';
import { loadSettings } from '@/lib/config';

export interface UsePdfLookaheadOptions {
  /** Loaded PDF pages, in page order (1-indexed via array position). */
  pages: PDFPageProxy[];
  /** PDF source URL — used as a stable identifier for the in-memory cache. */
  pdfUrl: string;
  /** Pages that have finished translating (from usePdfPageTranslations). */
  translatedPages: Set<number>;
  /** How many pages ahead to pre-translate. Defaults to 2 (N+1, N+2). */
  lookAheadRange?: number;
  /** Master switch. Defaults to true. */
  enabled?: boolean;
}

/** Per-document cancellation token. A fresh token is created for each
 *  `pdfUrl` lifecycle so in-flight work from a previous document is cancelled
 *  without affecting the new document's work. */
interface LookaheadToken {
  cancelled: boolean;
}

export function usePdfLookahead(options: UsePdfLookaheadOptions): void {
  const {
    pages,
    pdfUrl,
    translatedPages,
    lookAheadRange = 2,
    enabled = true,
  } = options;

  // Stabilize frequently-changing values across renders so the async worker
  // always sees the latest data without re-subscribing effects every render.
  const pagesRef = useRef(pages);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  const translatedPagesRef = useRef(translatedPages);
  useEffect(() => {
    translatedPagesRef.current = translatedPages;
  }, [translatedPages]);
  const pdfUrlRef = useRef(pdfUrl);
  useEffect(() => {
    pdfUrlRef.current = pdfUrl;
  }, [pdfUrl]);

  // Look-ahead pages currently being processed (prevents duplicate work).
  const inFlightRef = useRef<Set<number>>(new Set());
  // Source pages whose look-ahead targets have already been enqueued (avoids
  // re-enqueuing on every translatedPages reference change).
  const enqueuedRef = useRef<Set<number>>(new Set());
  // Cancellation token for the current pdfUrl lifecycle.
  const tokenRef = useRef<LookaheadToken>({ cancelled: false });

  // (Re)initialise state on mount and whenever the document changes. The
  // cleanup flips the previous token so any in-flight look-ahead bails out.
  useEffect(() => {
    const token: LookaheadToken = { cancelled: false };
    tokenRef.current = token;
    inFlightRef.current = new Set();
    enqueuedRef.current = new Set();
    return () => {
      token.cancelled = true;
    };
  }, [pdfUrl]);

  // Watch translatedPages for newly-finished pages and enqueue look-ahead.
  useEffect(() => {
    if (!enabled) return;
    if (pagesRef.current.length === 0) return;

    /** Enqueue extraction + translation for a single look-ahead page.
     *  Best-effort: yields to visible-page work by re-checking translatedPages
     *  after every await, and bails out if the document is cancelled. */
    async function processLookahead(target: number): Promise<void> {
      const token = tokenRef.current;
      if (token.cancelled) return;

      // 1. Validity: page number within range.
      const totalPages = pagesRef.current.length;
      if (target < 1 || target > totalPages) return;

      // 2. Already translated by the viewport hook? Yield.
      if (translatedPagesRef.current.has(target)) return;

      // 3. Already being processed by look-ahead? Skip.
      if (inFlightRef.current.has(target)) return;
      inFlightRef.current.add(target);

      try {
        // Yield a microtask so the viewport hook's synchronous observer
        // callbacks can claim a just-became-visible page before look-ahead.
        await Promise.resolve();
        if (token.cancelled) return;
        if (translatedPagesRef.current.has(target)) return;

        const page = pagesRef.current[target - 1];
        if (!page) return;

        // 4. In-memory cache hit? Nothing to do — page already pre-warmed.
        const settings = await loadSettings();
        if (token.cancelled) return;
        const cached = getMemoryCachedPage(
          pdfUrlRef.current,
          target,
          settings.sourceLanguage,
          settings.targetLanguage,
        );
        if (cached) return;

        // 5. Extract text.
        const { paragraphs } = await extractPageText(page, target);
        if (token.cancelled) return;

        // Empty page: record an empty cache entry so it isn't re-processed.
        if (paragraphs.length === 0) {
          setMemoryCachedPage(
            pdfUrlRef.current,
            target,
            new Map<string, string>(),
            settings.sourceLanguage,
            settings.targetLanguage,
          );
          return;
        }

        // Yield again after extraction — the viewport hook may have translated
        // the page while extraction was in flight.
        if (translatedPagesRef.current.has(target)) return;

        // 6. Translate via the shared background PDF semaphore.
        const results = await translateParagraphs(
          paragraphs.map((paragraph) => ({ pageNumber: target, paragraph })),
          pdfUrlRef.current,
        );
        if (token.cancelled) return;

        // 7. Store in the in-memory cache for instant serving on scroll.
        const paragraphMap = new Map<string, string>();
        for (const { id, translatedText } of results) {
          paragraphMap.set(id, translatedText);
        }
        setMemoryCachedPage(
          pdfUrlRef.current,
          target,
          paragraphMap,
          settings.sourceLanguage,
          settings.targetLanguage,
        );
      } catch {
        // Look-ahead is best-effort; failures are silently swallowed so they
        // never surface to the user. The viewport hook retries on scroll.
      } finally {
        inFlightRef.current.delete(target);
      }
    }

    for (const sourcePage of translatedPages) {
      if (enqueuedRef.current.has(sourcePage)) continue;
      enqueuedRef.current.add(sourcePage);
      for (let offset = 1; offset <= lookAheadRange; offset++) {
        void processLookahead(sourcePage + offset);
      }
    }
  }, [translatedPages, enabled, lookAheadRange, pages.length]);
}
