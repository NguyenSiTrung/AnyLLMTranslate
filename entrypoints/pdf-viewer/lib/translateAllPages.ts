/**
 * Translate-All Pipeline — force-translates every remaining page before PDF
 * generation (download / export).
 *
 * Design decisions:
 * - Pages already in `'translated'` state are skipped to avoid redundant LLM calls.
 * - Pages are processed sequentially to respect the PDF.js rendering semaphore
 *   (max 2 concurrent operations) and to give clear progress reporting.
 * - Individual page failures are caught and recorded so one bad page does not
 *   abort the entire pipeline.
 * - An `AbortSignal` can cancel the loop between pages.
 */

import type { PDFPageProxy } from 'pdfjs-dist';
import {
  type PageTranslations,
  translateParagraphs,
  setMemoryCachedPage,
} from './pdfTranslation';
import { extractPageText } from './pdfTextExtraction';
import { loadSettings } from '@/lib/config';

export interface TranslateAllPagesOptions {
  /** All loaded PDF pages (0-indexed array, 1-indexed page numbers). */
  pages: PDFPageProxy[];
  /** The PDF URL (used for cache keys). */
  pdfUrl: string;
  /** Existing translations — pages already in 'translated' state are skipped. */
  existingTranslations: Map<number, PageTranslations>;
  /** Called after each page completes. */
  onProgress?: (completedCount: number, totalCount: number) => void;
  /** Abort signal to cancel the process. */
  signal?: AbortSignal;
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
 * Force-translate all pages that are not yet in `'translated'` state.
 *
 * Returns the full merged translations map (existing + new), plus details of
 * any pages that failed so the caller can decide whether to proceed.
 */
export async function translateAllPages(
  options: TranslateAllPagesOptions,
): Promise<TranslateAllPagesResult> {
  const { pages, pdfUrl, existingTranslations, onProgress, signal } = options;

  // Clone existing translations into the result map
  const translations = new Map<number, PageTranslations>();
  for (const [pageNum, pageTranslation] of existingTranslations) {
    translations.set(pageNum, {
      ...pageTranslation,
      paragraphs: new Map(pageTranslation.paragraphs),
      originalParagraphs: pageTranslation.originalParagraphs
        ? [...pageTranslation.originalParagraphs]
        : undefined,
    });
  }

  // Identify pages that still need translation (1-indexed page numbers)
  const untranslatedPages: Array<{ page: PDFPageProxy; pageNumber: number }> = [];
  for (let i = 0; i < pages.length; i++) {
    const pageNumber = i + 1;
    const existing = translations.get(pageNumber);
    if (existing?.state === 'translated') continue;
    untranslatedPages.push({ page: pages[i], pageNumber });
  }

  const failedPages: number[] = [];
  const errors = new Map<number, string>();

  // Fast path: nothing to translate
  if (untranslatedPages.length === 0) {
    return { translations, failedPages, errors };
  }

  // Load settings once for the memory cache key
  const settings = await loadSettings();

  let completedCount = 0;
  const totalCount = untranslatedPages.length;

  for (const { page, pageNumber } of untranslatedPages) {
    // Check abort signal before each page
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      // 1. Extract text from the page
      const { paragraphs } = await extractPageText(page, pageNumber);

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

        // 4. Build the paragraph map from results
        const paragraphMap = new Map<string, string>();
        for (const { id, translatedText } of results) {
          paragraphMap.set(id, translatedText);
        }

        // 5. Store in result translations
        translations.set(pageNumber, {
          paragraphs: paragraphMap,
          originalParagraphs: paragraphs,
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

      // 7. Report progress
      completedCount++;
      onProgress?.(completedCount, totalCount);
    } catch (err) {
      // Re-throw abort errors — they are not page-specific failures
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }

      const message = err instanceof Error ? err.message : String(err);
      failedPages.push(pageNumber);
      errors.set(pageNumber, message);

      // Still report progress for failed pages
      completedCount++;
      onProgress?.(completedCount, totalCount);
    }
  }

  return { translations, failedPages, errors };
}
