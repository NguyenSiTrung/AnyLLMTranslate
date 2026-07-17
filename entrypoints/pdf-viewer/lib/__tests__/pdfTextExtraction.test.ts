/**
 * Unit tests for run-level PDF text extraction (pure grouping path).
 */
import { describe, it, expect } from 'vitest';
import {
  paragraphsFromTextItems,
  type PdfTextItemLike,
} from '../pdfTextExtraction';

/** Build a horizontal TextItem-like fixture. Transform: [a,b,c,d,e,f] with e=x, f=y. */
function item(
  str: string,
  opts: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    fontName?: string;
    a?: number;
    b?: number;
    c?: number;
    d?: number;
  } = {},
): PdfTextItemLike {
  const height = opts.height ?? 12;
  const a = opts.a ?? 1;
  const b = opts.b ?? 0;
  const c = opts.c ?? 0;
  const d = opts.d ?? height;
  return {
    str,
    transform: [a, b, c, d, opts.x ?? 0, opts.y ?? 100],
    width: opts.width ?? str.length * 6,
    height,
    fontName: opts.fontName ?? 'g_d0_f1',
  };
}

describe('paragraphsFromTextItems — display equation split', () => {
  it('keeps a numbered display equation as its own paragraph (not merged into intro)', () => {
    // Intro line above, equation line just below (tight gap would normally merge).
    const items = [
      item('GSPO employs the following sequence-level optimization objective:', {
        x: 50,
        y: 400,
        width: 400,
        height: 12,
        fontName: 'Times-Roman',
      }),
      item('JGSPO(θ)=E[min(si(θ)Ai,clip(si(θ),1-ε,1+ε)Ai)], (5)', {
        x: 80,
        y: 380,
        width: 350,
        height: 12,
        fontName: 'Times-Roman',
      }),
      item('where we adopt the group-based advantage estimation:', {
        x: 50,
        y: 360,
        width: 380,
        height: 12,
        fontName: 'Times-Roman',
      }),
    ];
    const paragraphs = paragraphsFromTextItems(items, 1, { skipReadingOrder: true });
    expect(paragraphs.length).toBeGreaterThanOrEqual(3);
    const eq = paragraphs.find((p) => p.text.includes('(5)'));
    expect(eq).toBeDefined();
    expect(eq!.text).not.toMatch(/employs the following/i);
    expect(eq!.text).not.toMatch(/where we adopt/i);
  });
});

describe('paragraphsFromTextItems — run grouping', () => {
  it('preserves separate runs for same-line items with different fonts/sizes', () => {
    const items = [
      item('The loss is ', { x: 50, y: 200, width: 60, height: 12, fontName: 'Times-Roman' }),
      item('L(θ)', {
        x: 115,
        y: 200,
        width: 24,
        height: 10,
        fontName: 'CMMI10',
      }),
      item(' where λ is rate.', {
        x: 145,
        y: 200,
        width: 90,
        height: 12,
        fontName: 'Times-Roman',
      }),
    ];

    const paragraphs = paragraphsFromTextItems(items, 1);
    expect(paragraphs).toHaveLength(1);
    const p = paragraphs[0];
    expect(p.runs).toBeDefined();
    expect(p.runs).toHaveLength(3);
    expect(p.runs![0]).toMatchObject({
      text: 'The loss is ',
      fontName: 'Times-Roman',
      fontSize: 12,
    });
    expect(p.runs![1]).toMatchObject({
      text: 'L(θ)',
      fontName: 'CMMI10',
      fontSize: 10,
      x: 115,
      y: 200,
    });
    expect(p.runs![2]).toMatchObject({
      text: ' where λ is rate.',
      fontName: 'Times-Roman',
      fontSize: 12,
    });
    // Aggregated text: existing trailing/leading spaces on items avoid double spaces
    expect(p.text).toBe('The loss is L(θ) where λ is rate.');
  });

  it('preserves run order and boxes across multi-line paragraphs', () => {
    // Two lines close enough to form one paragraph (gap < 1.6 * height)
    const items = [
      item('First line of', { x: 72, y: 700, width: 70, height: 11, fontName: 'g_d0_f2' }),
      item(' a paragraph', { x: 142, y: 700, width: 70, height: 11, fontName: 'g_d0_f2' }),
      item('continues here', { x: 72, y: 686, width: 80, height: 11, fontName: 'g_d0_f2' }),
    ];

    const paragraphs = paragraphsFromTextItems(items, 3);
    expect(paragraphs).toHaveLength(1);
    const p = paragraphs[0];
    expect(p.id).toBe('3-0');
    expect(p.runs).toHaveLength(3);
    expect(p.runs!.map((r) => r.text)).toEqual([
      'First line of',
      ' a paragraph',
      'continues here',
    ]);
    expect(p.runs![0].y).toBe(700);
    expect(p.runs![2].y).toBe(686);
    expect(p.runs![2].x).toBe(72);
    // Line join adds a space (no trailing hyphen)
    expect(p.text).toBe('First line of a paragraph continues here');
  });

  it('joins hyphenated line breaks without an extra space (current join rules)', () => {
    const items = [
      item('trans-', { x: 50, y: 500, width: 40, height: 10 }),
      item('lation', { x: 50, y: 488, width: 40, height: 10 }),
    ];
    const paragraphs = paragraphsFromTextItems(items, 1);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].text).toBe('trans-lation');
    expect(paragraphs[0].runs).toHaveLength(2);
  });

  it('splits paragraphs when vertical gap is large', () => {
    const items = [
      item('Paragraph one.', { x: 50, y: 600, width: 80, height: 10 }),
      item('Paragraph two.', { x: 50, y: 500, width: 80, height: 10 }),
    ];
    const paragraphs = paragraphsFromTextItems(items, 1);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].text).toBe('Paragraph one.');
    expect(paragraphs[1].text).toBe('Paragraph two.');
    expect(paragraphs[0].runs).toHaveLength(1);
    expect(paragraphs[1].runs).toHaveLength(1);
  });

  it('assigns empty fontName when missing', () => {
    const items: PdfTextItemLike[] = [
      {
        str: 'No font',
        transform: [1, 0, 0, 12, 10, 100],
        width: 40,
        height: 12,
      },
    ];
    const paragraphs = paragraphsFromTextItems(items, 1);
    expect(paragraphs[0].runs![0].fontName).toBe('');
  });
});
