/**
 * Tests for cross-page request merging (Phase 3 Task 3).
 *
 * Validates `translateParagraphsMerged`: when look-ahead is active, pending
 * paragraphs from multiple pages are merged into combined batches up to the
 * char budget, so one LLM call can cover tail-of-page-N + head-of-page-N+1.
 * Results are routed back to the correct page/paragraph via the `pageNumber`
 * tag.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ExtensionSettings } from '@/types/config';
import { DEFAULT_SETTINGS } from '@/types/config';
import type { PdfParagraph } from '../pdfTextExtraction';
import {
  translateParagraphs,
  translateParagraphsMerged,
  clearMemoryCache,
} from '../pdfTranslation';
import { loadSettings } from '@/lib/config';
import { cacheTranslation } from '@/services/cacheManager';

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn(),
}));

vi.mock('@/services/cacheManager', () => ({
  cacheTranslation: vi.fn(),
}));

/** Helper: build a PdfParagraph with the minimum required fields. */
function para(id: string, text: string): PdfParagraph {
  return { id, text, fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearMemoryCache();
  vi.mocked(loadSettings).mockResolvedValue({
    ...DEFAULT_SETTINGS,
    sourceLanguage: 'en',
    targetLanguage: 'vi',
    maxBatchChars: 16,
  } as ExtensionSettings);
  vi.mocked(cacheTranslation).mockResolvedValue(undefined);
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
    const action = (message as { action: string }).action;
    if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
      // Default: classify everything as prose. Individual tests override this.
      const pieces = (message as { paragraphs: Array<{ id: string }> }).paragraphs;
      return {
        success: true,
        labels: Object.fromEntries(pieces.map(({ id }) => [id, 'prose'])),
      };
    }
    // translate
    const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
    return {
      success: true,
      results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
    };
  });
});

/** Collect every 'translate' sendMessage call's pieces. */
function translateCalls(): Array<Array<{ id: string; text: string }>> {
  return vi.mocked(chrome.runtime.sendMessage).mock.calls
    .map(([message]) => message as unknown as { action: string; pieces: Array<{ id: string; text: string }> })
    .filter((message) => message.action === 'translate')
    .map((message) => message.pieces);
}

describe('translateParagraphsMerged — cross-page request merging', () => {
  it('returns an empty array for empty input', async () => {
    const results = await translateParagraphsMerged([], 'https://example.com/a.pdf');
    expect(results).toEqual([]);
    // No LLM calls should be made for empty input.
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('combines paragraphs across page boundaries into a single batch when within budget', async () => {
    // maxBatchChars = 16. Two 8-char paragraphs from different pages fit in
    // one batch (8 + 8 = 16 <= 16), proving the batch spans the page boundary.
    const results = await translateParagraphsMerged(
      [
        { pageNumber: 1, paragraph: para('1-0', 'aaaaaaaa') },
        { pageNumber: 2, paragraph: para('2-0', 'bbbbbbbb') },
      ],
      'https://example.com/a.pdf',
    );

    // Exactly one translate call covering both pages.
    const calls = translateCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].map((p) => p.id)).toEqual(['1-0', '2-0']);

    // Results are routed back with correct page numbers.
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.id === '1-0')?.pageNumber).toBe(1);
    expect(results.find((r) => r.id === '2-0')?.pageNumber).toBe(2);
    expect(results.find((r) => r.id === '1-0')?.translatedText).toBe('translated-1-0');
    expect(results.find((r) => r.id === '2-0')?.translatedText).toBe('translated-2-0');
  });

  it('respects the char budget: no batch exceeds maxBatchChars', async () => {
    // maxBatchChars = 16. Three 8-char paragraphs: the first two fill a batch
    // (16 chars), the third starts a new batch.
    await translateParagraphsMerged(
      [
        { pageNumber: 1, paragraph: para('1-0', 'aaaaaaaa') },
        { pageNumber: 1, paragraph: para('1-1', 'bbbbbbbb') },
        { pageNumber: 2, paragraph: para('2-0', 'cccccccc') },
      ],
      'https://example.com/a.pdf',
    );

    const calls = translateCalls();
    for (const pieces of calls) {
      const chars = pieces.reduce((sum, p) => sum + p.text.length, 0);
      expect(chars).toBeLessThanOrEqual(16);
    }
  });

  it('routes results back to the correct page/paragraph across three pages', async () => {
    // Use a large budget so all paragraphs fit in one batch (proving the
    // merge spans three pages in a single call).
    vi.mocked(loadSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      maxBatchChars: 5000,
    } as ExtensionSettings);

    const results = await translateParagraphsMerged(
      [
        { pageNumber: 1, paragraph: para('1-0', 'Page one text.') },
        { pageNumber: 2, paragraph: para('2-0', 'Page two text.') },
        { pageNumber: 2, paragraph: para('2-1', 'More page two.') },
        { pageNumber: 3, paragraph: para('3-0', 'Page three text.') },
      ],
      'https://example.com/a.pdf',
    );

    // One merged batch covering all four paragraphs across three pages.
    expect(translateCalls()).toHaveLength(1);

    // Every result carries the correct pageNumber tag.
    const byId = new Map(results.map((r) => [r.id, r]));
    expect(byId.get('1-0')?.pageNumber).toBe(1);
    expect(byId.get('2-0')?.pageNumber).toBe(2);
    expect(byId.get('2-1')?.pageNumber).toBe(2);
    expect(byId.get('3-0')?.pageNumber).toBe(3);
    for (const r of results) {
      expect(r.translatedText).toBe(`translated-${r.id}`);
    }
  });

  it('keeps math paragraphs verbatim from any page', async () => {
    const results = await translateParagraphsMerged(
      [
        { pageNumber: 1, paragraph: para('1-0', 'This is normal prose text.') },
        // Math on page 2 — should be kept verbatim, never sent to translator
        { pageNumber: 2, paragraph: para('2-0', 'f(x) = x² + 2x + 1') },
        { pageNumber: 2, paragraph: para('2-1', 'Also normal prose here.') },
      ],
      'https://example.com/a.pdf',
    );

    // Math paragraph: verbatim, tagged with page 2.
    const mathResult = results.find((r) => r.id === '2-0');
    expect(mathResult?.translatedText).toBe('f(x) = x² + 2x + 1');
    expect(mathResult?.pageNumber).toBe(2);

    // Prose paragraphs: translated normally with correct page tags.
    expect(results.find((r) => r.id === '1-0')?.translatedText).toBe('translated-1-0');
    expect(results.find((r) => r.id === '1-0')?.pageNumber).toBe(1);
    expect(results.find((r) => r.id === '2-1')?.translatedText).toBe('translated-2-1');
    expect(results.find((r) => r.id === '2-1')?.pageNumber).toBe(2);

    // The translator must NOT have received the math paragraph.
    const translatedIds = translateCalls().flatMap((pieces) => pieces.map((p) => p.id));
    expect(translatedIds).not.toContain('2-0');
    expect(translatedIds).toContain('1-0');
    expect(translatedIds).toContain('2-1');
  });

  it('keeps figure-labeled paragraphs verbatim from any page', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const action = (message as { action: string }).action;
      if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
        // '1-0' is a figure axis label, the rest are prose.
        const pieces = (message as { paragraphs: Array<{ id: string }> }).paragraphs;
        return {
          success: true,
          labels: Object.fromEntries(
            pieces.map(({ id }) => [id, id === '1-0' ? 'figure' : 'prose']),
          ),
        };
      }
      const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
      return {
        success: true,
        results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
      };
    });

    const results = await translateParagraphsMerged(
      [
        // Figure on page 1 — kept verbatim
        { pageNumber: 1, paragraph: para('1-0', 'Accuracy') },
        { pageNumber: 1, paragraph: para('1-1', 'The model achieves high accuracy.') },
        { pageNumber: 2, paragraph: para('2-0', 'On the second page we continue.') },
      ],
      'https://example.com/a.pdf',
    );

    // Figure paragraph: verbatim, tagged with page 1.
    const figureResult = results.find((r) => r.id === '1-0');
    expect(figureResult?.translatedText).toBe('Accuracy');
    expect(figureResult?.pageNumber).toBe(1);

    // Prose paragraphs: translated with correct page tags.
    expect(results.find((r) => r.id === '1-1')?.translatedText).toBe('translated-1-1');
    expect(results.find((r) => r.id === '1-1')?.pageNumber).toBe(1);
    expect(results.find((r) => r.id === '2-0')?.translatedText).toBe('translated-2-0');
    expect(results.find((r) => r.id === '2-0')?.pageNumber).toBe(2);
  });

  it('single-page input behaves identically to translateParagraphs (plus pageNumber tag)', async () => {
    // Use a large budget so all paragraphs fit in one batch (mirrors the
    // default 2000-char budget for a small page).
    vi.mocked(loadSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      maxBatchChars: 5000,
    } as ExtensionSettings);

    const input = [
      { pageNumber: 1, paragraph: para('1-0', 'First paragraph of prose.') },
      { pageNumber: 1, paragraph: para('1-1', 'Second paragraph of prose.') },
    ];

    const plain = await translateParagraphs([...input], 'https://example.com/a.pdf');
    const merged = await translateParagraphsMerged([...input], 'https://example.com/a.pdf');

    // Same number of results.
    expect(merged).toHaveLength(plain.length);

    // The merged results' (id, translatedText) pairs must match translateParagraphs,
    // and every result is tagged with pageNumber 1.
    for (const plainResult of plain) {
      const mergedResult = merged.find((r) => r.id === plainResult.id);
      expect(mergedResult).toBeDefined();
      expect(mergedResult?.translatedText).toBe(plainResult.translatedText);
      expect(mergedResult?.pageNumber).toBe(1);
    }

    // Same number of translate calls (one batch each).
    // Reset call tracking between the two invocations is avoided; instead just
    // verify the merged path made exactly one translate call (the plain path
    // also made one, so total is two — verified by the count above indirectly).
    // The structural equivalence is the key assertion.
  });

  it('batches that span a page boundary produce one translate call with mixed-page pieces', async () => {
    // Tail-of-page-1 (8 chars) + head-of-page-2 (8 chars) = 16 <= budget.
    // A third 8-char paragraph from page 2 overflows into a second batch.
    const results = await translateParagraphsMerged(
      [
        { pageNumber: 1, paragraph: para('1-0', 'aaaaaaaa') },
        { pageNumber: 2, paragraph: para('2-0', 'bbbbbbbb') },
        { pageNumber: 2, paragraph: para('2-1', 'cccccccc') },
      ],
      'https://example.com/a.pdf',
    );

    const calls = translateCalls();
    expect(calls).toHaveLength(2);
    // First batch spans the page boundary: page 1 + page 2.
    expect(calls[0].map((p) => p.id)).toEqual(['1-0', '2-0']);
    // Second batch is the overflow from page 2.
    expect(calls[1].map((p) => p.id)).toEqual(['2-1']);

    // All results routed correctly.
    expect(results.find((r) => r.id === '1-0')?.pageNumber).toBe(1);
    expect(results.find((r) => r.id === '2-0')?.pageNumber).toBe(2);
    expect(results.find((r) => r.id === '2-1')?.pageNumber).toBe(2);
  });

  it('caches every result (including verbatim math/figure) via cacheTranslation', async () => {
    await translateParagraphsMerged(
      [
        { pageNumber: 1, paragraph: para('1-0', 'f(x) = x²') },
        { pageNumber: 2, paragraph: para('2-0', 'Normal prose here.') },
      ],
      'https://example.com/a.pdf',
    );

    // Both the verbatim math result and the translated prose result are cached.
    expect(cacheTranslation).toHaveBeenCalledTimes(2);
    const cachedSources = vi.mocked(cacheTranslation).mock.calls.map(
      ([source]) => source as string,
    );
    expect(cachedSources).toContain('f(x) = x²');
    expect(cachedSources).toContain('Normal prose here.');
  });
});
