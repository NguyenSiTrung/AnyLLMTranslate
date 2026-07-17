/**
 * Multi-column reading-order unit tests.
 */
import { describe, it, expect } from 'vitest';
import { sortParagraphsReadingOrder } from '../pdfReadingOrder';
import type { PdfParagraph } from '../pdfTextExtraction';

function p(
  id: string,
  text: string,
  geom: Partial<Pick<PdfParagraph, 'x' | 'y' | 'width' | 'height'>> = {},
): PdfParagraph {
  return {
    id,
    text,
    fontSize: 10,
    isHeading: false,
    x: geom.x ?? 0,
    y: geom.y ?? 0,
    width: geom.width ?? 100,
    height: geom.height ?? 10,
  };
}

describe('sortParagraphsReadingOrder', () => {
  it('orders left column fully before right in a two-column layout', () => {
    // Page width 500. Left column x~50, right column x~280.
    const paragraphs = [
      p('r0', 'Right top', { x: 280, y: 700, width: 180 }),
      p('l0', 'Left top', { x: 50, y: 700, width: 180 }),
      p('r1', 'Right bottom', { x: 280, y: 600, width: 180 }),
      p('l1', 'Left bottom', { x: 50, y: 600, width: 180 }),
    ];
    const ordered = sortParagraphsReadingOrder(paragraphs, { pageWidth: 500 });
    const ids = ordered.map((x) => x.id);
    // Left column top→bottom, then right column top→bottom
    expect(ids.indexOf('l0')).toBeLessThan(ids.indexOf('l1'));
    expect(ids.indexOf('r0')).toBeLessThan(ids.indexOf('r1'));
    expect(ids.indexOf('l1')).toBeLessThan(ids.indexOf('r0'));
  });

  it('leaves single-column order top-to-bottom unchanged', () => {
    const paragraphs = [
      p('a', 'First', { x: 50, y: 700, width: 200 }),
      p('b', 'Second', { x: 50, y: 650, width: 200 }),
      p('c', 'Third', { x: 50, y: 600, width: 200 }),
    ];
    const ordered = sortParagraphsReadingOrder(paragraphs, { pageWidth: 500 });
    expect(ordered.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not force a wide centered title into a side column', () => {
    const paragraphs = [
      p('title', 'A Very Wide Centered Title Across The Page', {
        x: 50,
        y: 750,
        width: 400, // 400/500 = 0.8 spanning
      }),
      p('l0', 'Left body', { x: 50, y: 700, width: 180 }),
      p('r0', 'Right body', { x: 280, y: 700, width: 180 }),
    ];
    const ordered = sortParagraphsReadingOrder(paragraphs, { pageWidth: 500 });
    const ids = ordered.map((x) => x.id);
    // Title first (higher y), then left column, then right
    expect(ids[0]).toBe('title');
    expect(ids.indexOf('l0')).toBeLessThan(ids.indexOf('r0'));
  });
});
