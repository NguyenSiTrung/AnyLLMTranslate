/**
 * Unit tests for pure PDF content detection (math + table-like figure rules).
 */
import { describe, it, expect } from 'vitest';
import {
  classifyMathParagraph,
  classifyTableLikeParagraphs,
  isObviouslyProse,
} from '../pdfContentDetect';
import type { PdfParagraph } from '../pdfTextExtraction';

function para(
  id: string,
  text: string,
  geom: Partial<Pick<PdfParagraph, 'x' | 'y' | 'width' | 'height' | 'fontSize' | 'isHeading'>> = {},
): PdfParagraph {
  return {
    id,
    text,
    fontSize: geom.fontSize ?? 10,
    isHeading: geom.isHeading ?? false,
    x: geom.x ?? 0,
    y: geom.y ?? 0,
    width: geom.width ?? 40,
    height: geom.height ?? 10,
  };
}

describe('classifyMathParagraph (enhanced)', () => {
  it('flags classic short Unicode equations as math', () => {
    expect(classifyMathParagraph('f(x) = x² + 2x + 1')).toBe('math');
    expect(classifyMathParagraph('L(θ) = Σᵢ ℓ(yᵢ, ŷᵢ)')).toBe('math');
  });

  it('flags Mathematical Alphanumeric Symbols formulas as math', () => {
    // 𝑥 (U+1D465 mathematical italic small x), 𝑦 (U+1D466)
    const italicX = '\u{1D465}';
    const italicY = '\u{1D466}';
    expect(classifyMathParagraph(`${italicX} = ${italicY} + 1`)).toBe('math');
  });

  it('flags longer density-dominated equations as math', () => {
    // > 12 words but still pure math / notation-heavy (PDF-extracted style)
    const longEq =
      'E[L] = ∫ ℓ(y, f(x)) dP(x, y) ≈ (1/n) Σᵢ₌₁ⁿ ℓ(yᵢ, f(xᵢ)) subject to ‖w‖₂ ≤ C';
    expect(classifyMathParagraph(longEq)).toBe('math');
  });

  it('flags ASCII caret-style equations with equals as math', () => {
    expect(classifyMathParagraph('E = mc^2')).toBe('math');
    expect(classifyMathParagraph('a_i = b_j + c_k')).toBe('math');
  });

  it('keeps mixed prose-with-inline-math as prose', () => {
    expect(
      classifyMathParagraph(
        'The loss L(θ) = Σᵢ ℓ is minimized over the training set using SGD.',
      ),
    ).toBe('prose');
  });

  it('flags block LaTeX regardless of length', () => {
    expect(classifyMathParagraph('Consider $$\\sum_{i=1}^{n} x_i$$ above.')).toBe('math');
  });
});

describe('classifyTableLikeParagraphs', () => {
  it('marks pure numeric / percent / currency fragments as figure', () => {
    const paragraphs = [
      para('1-0', '98.5%'),
      para('1-1', '$1,234'),
      para('1-2', '42'),
      para('1-3', 'This is a normal full sentence of running prose about results.'),
    ];
    const ids = classifyTableLikeParagraphs(paragraphs);
    expect(ids.has('1-0')).toBe(true);
    expect(ids.has('1-1')).toBe(true);
    expect(ids.has('1-2')).toBe(true);
    expect(ids.has('1-3')).toBe(false);
  });

  it('marks a 3+ cell row of short labels as figure', () => {
    // Three short cells on the same baseline y
    const paragraphs = [
      para('1-0', 'Model', { x: 50, y: 700, width: 40 }),
      para('1-1', 'Acc', { x: 120, y: 700, width: 30 }),
      para('1-2', 'F1', { x: 180, y: 700, width: 30 }),
      para('1-3', 'We evaluate three models on the benchmark suite.', {
        x: 50,
        y: 650,
        width: 400,
      }),
    ];
    const ids = classifyTableLikeParagraphs(paragraphs);
    expect(ids.has('1-0')).toBe(true);
    expect(ids.has('1-1')).toBe(true);
    expect(ids.has('1-2')).toBe(true);
    expect(ids.has('1-3')).toBe(false);
  });

  it('marks multi-row 2-column short grids as figure', () => {
    const paragraphs = [
      para('1-0', 'Train', { x: 50, y: 700, width: 40 }),
      para('1-1', '0.91', { x: 150, y: 700, width: 40 }),
      para('1-2', 'Test', { x: 50, y: 680, width: 40 }),
      para('1-3', '0.88', { x: 150, y: 680, width: 40 }),
      para('1-4', 'The table above reports mean accuracy.', {
        x: 50,
        y: 620,
        width: 400,
      }),
    ];
    const ids = classifyTableLikeParagraphs(paragraphs);
    expect(ids.has('1-0')).toBe(true);
    expect(ids.has('1-1')).toBe(true);
    expect(ids.has('1-2')).toBe(true);
    expect(ids.has('1-3')).toBe(true);
    expect(ids.has('1-4')).toBe(false);
  });

  it('does not flag a single isolated short word as a table cell', () => {
    const paragraphs = [
      para('1-0', 'Abstract', { x: 50, y: 700, width: 80, isHeading: true }),
      para('1-1', 'Deep learning has transformed computer vision research significantly over the last decade.', {
        x: 50,
        y: 650,
        width: 400,
      }),
    ];
    const ids = classifyTableLikeParagraphs(paragraphs);
    expect(ids.has('1-0')).toBe(false);
    expect(ids.has('1-1')).toBe(false);
  });
});

describe('isObviouslyProse', () => {
  it('returns true for long latin prose', () => {
    expect(
      isObviouslyProse(
        'Deep learning has transformed computer vision research significantly over the last decade with large models.',
      ),
    ).toBe(true);
  });

  it('returns false for short labels', () => {
    expect(isObviouslyProse('Accuracy')).toBe(false);
  });
});
