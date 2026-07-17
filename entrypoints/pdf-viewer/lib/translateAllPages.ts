/**
 * Translate-All Pipeline — force-translates every remaining page before PDF
 * generation (download / export).
 *
 * The download path is split into two phases:
 *
 * 1. **Concurrent translation** (this module): extract text + translate every
 *    untranslated page CONCURRENTLY, bounded by a configurable concurrency
 *    limit (default 4 pages in flight). Each page's extract→translate→cache
 *    work is independent, so pages are processed in parallel for throughput.
 *    The background service worker's PDF semaphore (max 2 concurrent LLM
 *    calls) further bounds the actual network requests, so this limit only
 *    controls how many pages sit in the extract→translate pipeline at once.
 *    Per-page error isolation: a failed page is recorded in `failedPages` and
 *    does NOT abort the remaining pages (`Promise.allSettled`-style handling).
 *
 * 2. **Serial PDF generation** (`translatedPdfGenerator.ts`, invoked by
 *    `usePdfDownload` AFTER this function resolves): pdf-lib is not
 *    thread-safe, so generation stays serialized one page at a time. Because
 *    this function fully resolves only once every page has been translated (or
 *    recorded as failed), all text is pre-translated concurrently before any
 *    pdf-lib work begins.
 *
 * Other design decisions:
 * - Pages already in `'translated'` state are skipped to avoid redundant LLM calls.
 * - An `AbortSignal` cancels the pipeline: once aborted, no new pages are
 *   dispatched; in-flight pages are allowed to settle (so we never leave
 *   unhandled promise rejections), and the function rejects with an
 *   `AbortError`.
 */

import type { PDFPageProxy } from 'pdfjs-dist';
import {
  type PageTranslations,
  translateParagraphs,
  setMemoryCachedPage,
} from './pdfTranslation';
import type { ContentKind } from './pdfContentDetect';
import { extractPageText } from './pdfTextExtraction';
import { loadSettings } from '@/lib/config';

/** Maximum number of pages translated concurrently during the download path.
 *  The background service worker's PDF semaphore (max 2 concurrent LLM calls)
 *  further bounds the actual network requests, so this only controls how many
 *  pages are in the extract→translate pipeline at once. */
const DEFAULT_TRANSLATION_CONCURRENCY = 4;

export interface TranslateAllPagesOptions {
  /** All loaded PDF pages (0-indexed array, 1-indexed page numbers). */
  pages: PDFPageProxy[];
  /** The PDF URL (used for cache keys). */
  pdfUrl: string;
  /** Existing translations — pages already in 'translated' state are skipped. */
  existingTranslations: Map<number, PageTranslations>;
  /** Called after each page completes (success or failure). */
  onProgress?: (completedCount: number, totalCount: number) => void;
  /** Abort signal to cancel the process. */
  signal?: AbortSignal;
  /** Max pages translated concurrently (default 4). */
  concurrency?: number;
}

export interface TranslateAllPagesResult {
  /** Merged translations (existing + newly translated). */
  translations: Map<number, PageTranslations>;
  /** Page numbers that failed. */
  failedPages: number[];
  /** Error messages by page number. */
  errors: Map<number, string>;
}

/**
 * Force-translate all pages that are not yet in `'translated'` state, CONCURRENTLY.
 *
 * Returns the full merged translations map (existing + new), plus details of
 * any pages that failed so the caller can decide whether to proceed. The
 * caller (`usePdfDownload`) runs the serial pdf-lib generation phase only
 * after this resolves, so all text is pre-translated before generation starts.
 */
export async function translateAllPages(
  options: TranslateAllPagesOptions,
): Promise<TranslateAllPagesResult> {
  const {
    pages,
    pdfUrl,
    existingTranslations,
    onProgress,
    signal,
    concurrency = DEFAULT_TRANSLATION_CONCURRENCY,
  } = options;

  // Clone existing translations into the result map
  const translations = new Map<number, PageTranslations>();
  for (const [pageNum, pageTranslation] of existingTranslations) {
    translations.set(pageNum, {
      ...pageTranslation,
      paragraphs: new Map(pageTranslation.paragraphs),
      originalParagraphs: pageTranslation.originalParagraphs
        ? [...pageTranslation.originalParagraphs]
        : undefined,
      paragraphKinds: pageTranslation.paragraphKinds
        ? new Map(pageTranslation.paragraphKinds)
        : undefined,
    });
  }

  // Identify pages that still need translation (1-indexed page numbers)
  const queue: Array<{ page: PDFPageProxy; pageNumber: number }> = [];
  for (let i = 0; i < pages.length; i++) {
    const pageNumber = i + 1;
    const existing = translations.get(pageNumber);
    if (existing?.state === 'translated') continue;
    queue.push({ page: pages[i], pageNumber });
  }

  const failedPages: number[] = [];
  const errors = new Map<number, string>();

  // Fast path: nothing to translate
  if (queue.length === 0) {
    return { translations, failedPages, errors };
  }

  // Load settings once for the memory cache key
  const settings = await loadSettings();

  let completedCount = 0;
  const totalCount = queue.length;
  // Set when an AbortError surfaces from a page (defensive — the primary abort
  // signal is `signal.aborted`). Causes the worker pool to wind down.
  let aborted = false;

  /**
   * Translate a single page. Records success into `translations` or failure
   * into `failedPages`/`errors`. Never throws (errors are captured per-page)
   * so the concurrency pool can use `Promise.allSettled`-style isolation —
   * one bad page never breaks the whole export.
   */
  async function processPage(entry: {
    page: PDFPageProxy;
    pageNumber: number;
  }): Promise<void> {
    const { page, pageNumber } = entry;
    try {
      // 1. Extract text from the page
      const { paragraphs } = await extractPageText(page, pageNumber);

      // Bail out without recording if aborted mid-page — the whole result is
      // discarded by the caller path anyway, but skipping the cache write and
      // progress report keeps the UI coherent.
      if (signal?.aborted) return;

      // 2. If no text, mark as translated with empty map
      if (paragraphs.length === 0) {
        translations.set(pageNumber, {
          paragraphs: new Map(),
          originalParagraphs: [],
          state: 'translated',
        });
      } else {
        // 3. Translate all paragraphs
        const results = await translateParagraphs(
          paragraphs.map((p) => ({ pageNumber, paragraph: p })),
          pdfUrl,
        );

        if (signal?.aborted) return;

        // 4. Build the paragraph map + kinds from results
        const paragraphMap = new Map<string, string>();
        const kindMap = new Map<string, ContentKind>();
        const compositionMap = new Map<
          string,
          Array<{ kind: 'prose' | 'formula'; text: string }>
        >();
        for (const { id, translatedText, kind, compositions } of results) {
          paragraphMap.set(id, translatedText);
          if (kind) kindMap.set(id, kind);
          if (compositions && compositions.length > 0) {
            compositionMap.set(id, compositions);
          }
        }

        // 5. Store in result translations
        translations.set(pageNumber, {
          paragraphs: paragraphMap,
          originalParagraphs: paragraphs,
          paragraphKinds: kindMap.size > 0 ? kindMap : undefined,
          paragraphCompositions: compositionMap.size > 0 ? compositionMap : undefined,
          state: 'translated',
        });

        // 6. Update memory cache
        setMemoryCachedPage(
          pdfUrl,
          pageNumber,
          paragraphMap,
          settings.sourceLanguage,
          settings.targetLanguage,
        );
      }
    } catch (err) {
      // AbortErrors are not page-specific failures — flag abort and let the
      // pool wind down. The function rejects with AbortError after in-flight
      // work settles.
      if (err instanceof DOMException && err.name === 'AbortError') {
        aborted = true;
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      failedPages.push(pageNumber);
      errors.set(pageNumber, message);
    } finally {
      completedCount++;
      // Skip progress reporting once aborted so the UI doesn't advance past
      // the cancellation point.
      if (!signal?.aborted && !aborted) {
        onProgress?.(completedCount, totalCount);
      }
    }
  }

  // ── Phase 1: Concurrent translation (bounded) ───────────────────────────
  // N workers pull pages from a shared queue via a synchronous index bump
  // (safe under JS's single-threaded event loop). Each worker processes one
  // page at a time, so at most `workerCount` pages are in flight. When the
  // signal aborts, workers finish their current page then stop pulling, so no
  // new pages are dispatched while in-flight work settles cleanly.
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, queue.length);

  async function translationWorker(): Promise<void> {
    while (!signal?.aborted && !aborted) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= queue.length) return;
      await processPage(queue[index]);
    }
  }

  const workers = Array.from({ length: workerCount }, () => translationWorker());
  // allSettled guarantees we never surface an unhandled rejection from a
  // worker (processPage already catches, but this is belt-and-suspenders) and
  // that we only proceed once every worker has fully stopped.
  await Promise.allSettled(workers);

  if (signal?.aborted || aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  return { translations, failedPages, errors };
}
