/**
 * Tests for the PDF paragraph grouping heuristic.
 *
 * The grouping algorithm is pure — we feed it a synthetic `TextItem[]` array
 * and assert on the resulting `PdfParagraph[]`. No PDF.js required.
 */

import { describe, it, expect } from 'vitest';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { extractPageText, type PdfPageText } from '../pdfTextExtraction';

/** Helper to build a synthetic TextItem with a given position. */
function item(text: string, x: number, y: number, height = 12, width = 50): TextItem {
  return {
    str: text,
    dir: 'ltr',
    width,
    height,
    transform: [1, 0, 0, 1, x, y],
    fontName: 'g_d0_f1',
    hasEOL: false,
  };
}

/** Build a minimal `PDFPageProxy`-like object for `extractPageText`. */
function fakePage(items: TextItem[]) {
  return {
    getTextContent: () =>
      Promise.resolve({
        items,
        styles: {},
        lang: null,
        dir: null,
        canvasWidth: 0,
        transform: undefined,
      }),
    pageNumber: 1,
    getViewport: () => ({ width: 600, height: 800 }),
    cleanup: () => Promise.resolve(),
  } as unknown as Parameters<typeof extractPageText>[0];
}

describe('pdfTextExtraction', () => {
  it('groups consecutive same-y items into a single line', async () => {
    const page = fakePage([
      item('Hello', 100, 700),
      item('world', 160, 700),
    ]);
    const result: PdfPageText = await extractPageText(page, 1);
    expect(result.pageNumber).toBe(1);
    expect(result.paragraphs).toHaveLength(1);
    expect(result.paragraphs[0].text).toBe('Hello world');
  });

  it('marks paragraphs with large fonts as headings', async () => {
    // Use many body-sized lines so the median sits at 12, then a single
    // oversized line (48pt) — which is > 1.4x median → heading.
    const items: TextItem[] = [];
    for (let i = 0; i < 5; i++) {
      items.push(item(`Body line ${i}`, 100, 700 - i * 5, 12));
    }
    // Large heading on its own line, well-separated from body lines
    items.push(item('Big heading', 100, 400, 48));
    const page = fakePage(items);
    const result = await extractPageText(page, 1);
    // 1 paragraph of 5 body lines + 1 paragraph for the heading
    expect(result.paragraphs).toHaveLength(2);
    expect(result.paragraphs[1].isHeading).toBe(true);
    expect(result.paragraphs[0].isHeading).toBe(false);
  });
});

