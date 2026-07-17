/**
 * Regression: generator / typesetting ladder integration.
 * Short text stays near natural size; long text scales; math skip via
 * getProseMaskRects remains the gate (no ladder when kind is math/figure).
 */

import { describe, it, expect } from 'vitest';
import { fitTextToBox, type FontMetricsHook } from '../pdfTypesetting';
import { clampFontSize, wrapText } from '../translatedPdfGenerator';
import { getProseMaskRects } from '../pdfComposition';
import type { PdfParagraph } from '../pdfTextExtraction';

/** Monospace-ish pdf-lib-style font stub. */
function makeFontStub(charWidthFactor = 0.5) {
  return {
    widthOfTextAtSize(text: string, size: number) {
      return text.length * size * charWidthFactor;
    },
  };
}

function makeMetrics(font: ReturnType<typeof makeFontStub>): FontMetricsHook {
  return {
    measure({ text, fontSize, lineHeight, width }) {
      const lines = wrapText(text, width, fontSize, font);
      return {
        lines,
        height: Math.max(1, lines.length) * fontSize * lineHeight,
      };
    },
  };
}

function makePara(overrides: Partial<PdfParagraph> & Pick<PdfParagraph, 'id' | 'text'>): PdfParagraph {
  return {
    pageNumber: 1,
    x: 50,
    y: 700,
    width: 200,
    height: 40,
    fontSize: 12,
    fontName: 'Helvetica',
    isHeading: false,
    ...overrides,
  };
}

describe('generator typesetting ladder integration', () => {
  const font = makeFontStub();
  const metrics = makeMetrics(font);

  it('keeps short text at natural (clamped) font size', () => {
    const natural = clampFontSize(14);
    const result = fitTextToBox({
      box: { x: 50, y: 700, width: 200, height: 40 },
      text: 'Hello world',
      naturalFontSize: natural,
      metrics,
    });
    expect(result.overflow).toBe(false);
    expect(result.fontSize).toBe(natural);
    expect(result.lines.join(' ')).toContain('Hello');
  });

  it('scales or expands long translated text instead of overflowing silently', () => {
    const long = Array.from({ length: 100 }, (_, i) => `translated${i}`).join(' ');
    const result = fitTextToBox({
      box: { x: 50, y: 700, width: 100, height: 36 },
      text: long,
      naturalFontSize: clampFontSize(14),
      metrics,
      freeSpace: { right: 80, down: 0 },
    });
    expect(result.fontSize).toBeLessThanOrEqual(clampFontSize(14));
    // Either expanded width or reduced font (or both)
    const expanded = result.box.width > 100;
    const scaled = result.fontSize < clampFontSize(14);
    expect(expanded || scaled || result.overflow).toBe(true);
  });

  it('preserves math/figure skip via getProseMaskRects (no prose mask)', () => {
    const para = makePara({
      id: 'm1',
      text: 'E = mc^2',
      kind: 'math',
    });
    // Math kind must not produce prose masks regardless of translation text.
    const masks = getProseMaskRects(para, 'math', 'E = mc^2');
    expect(masks).toBeNull();

    const figurePara = makePara({ id: 'f1', text: 'Fig. 1', kind: 'figure' });
    expect(getProseMaskRects(figurePara, 'figure', 'Fig. 1')).toBeNull();
  });

  it('clampFontSize still floors and caps sizes used as ladder natural size', () => {
    expect(clampFontSize(4)).toBe(12);
    expect(clampFontSize(100)).toBe(32);
    expect(clampFontSize(16)).toBe(16);
  });
});
