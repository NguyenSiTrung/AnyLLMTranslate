/**
 * Unit tests for pure PDF content detection (math + table-like figure rules).
 */
import { describe, it, expect } from 'vitest';
import {
  classifyMathParagraph,
  classifyMathParagraphFromParagraph,
  classifyRuns,
  classifyTableLikeParagraphs,
  isFormulaDominated,
  isFormulaFontName,
  isObviouslyProse,
} from '../pdfContentDetect';
import type { PdfParagraph, PdfTextRun } from '../pdfTextExtraction';

function para(
  id: string,
  text: string,
  geom: Partial<Pick<PdfParagraph, 'x' | 'y' | 'width' | 'height' | 'fontSize' | 'isHeading' | 'runs'>> = {},
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
    runs: geom.runs,
  };
}

function run(
  text: string,
  opts: Partial<Pick<PdfTextRun, 'fontName' | 'fontSize' | 'x' | 'y' | 'width' | 'height'>> = {},
): PdfTextRun {
  const fontSize = opts.fontSize ?? 12;
  return {
    text,
    fontName: opts.fontName ?? 'Times-Roman',
    fontSize,
    x: opts.x ?? 0,
    y: opts.y ?? 100,
    width: opts.width ?? text.length * 6,
    height: opts.height ?? fontSize,
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

describe('isFormulaFontName', () => {
  it('flags TeX/CM/Symbol-like font names as formula', () => {
    expect(isFormulaFontName('CMMI10')).toBe(true);
    expect(isFormulaFontName('CMSY8')).toBe(true);
    expect(isFormulaFontName('CMEX10')).toBe(true);
    expect(isFormulaFontName('MSBM10')).toBe(true);
    expect(isFormulaFontName('STIXMath-Regular')).toBe(true);
    expect(isFormulaFontName('CambriaMath')).toBe(true);
    expect(isFormulaFontName('Symbol')).toBe(true);
    expect(isFormulaFontName('g_d0_CMMI10')).toBe(true);
  });

  it('keeps body fonts as non-formula', () => {
    expect(isFormulaFontName('Times-Roman')).toBe(false);
    expect(isFormulaFontName('Helvetica')).toBe(false);
    expect(isFormulaFontName('g_d0_f1')).toBe(false);
    expect(isFormulaFontName('')).toBe(false);
    expect(isFormulaFontName('CMR10')).toBe(false); // body Computer Modern Roman
  });
});

describe('classifyRuns', () => {
  it('marks TeX/CM font runs as formula and body as prose', () => {
    const runs = [
      run('The loss is ', { fontName: 'Times-Roman', fontSize: 12 }),
      run('L(theta)', { fontName: 'CMMI10', fontSize: 12 }),
      run(' where the rate is used.', { fontName: 'Times-Roman', fontSize: 12 }),
    ];
    expect(classifyRuns(runs)).toEqual(['prose', 'formula', 'prose']);
  });

  it('marks sub/superscript-sized runs as formula (~0.79× median)', () => {
    const runs = [
      run('index ', { fontName: 'Times-Roman', fontSize: 12, height: 12 }),
      run('i', { fontName: 'Times-Roman', fontSize: 8, height: 8 }), // 8/12 = 0.67 < 0.79
      run(' of the vector', { fontName: 'Times-Roman', fontSize: 12, height: 12 }),
    ];
    expect(classifyRuns(runs)).toEqual(['prose', 'formula', 'prose']);
  });

  it('does not flag slightly smaller body runs at default ratio', () => {
    // 10/12 ≈ 0.83 > 0.79
    const runs = [
      run('Hello world text', { fontName: 'Times-Roman', fontSize: 12 }),
      run(' slightly smaller', { fontName: 'Times-Roman', fontSize: 10 }),
    ];
    expect(classifyRuns(runs)).toEqual(['prose', 'prose']);
  });

  it('with strictMath, uses a looser size threshold', () => {
    // 10/12 ≈ 0.83 < 0.85 strict threshold
    const runs = [
      run('Hello world text', { fontName: 'Times-Roman', fontSize: 12 }),
      run(' slightly smaller', { fontName: 'Times-Roman', fontSize: 10 }),
    ];
    expect(classifyRuns(runs, { strictMath: true })).toEqual(['prose', 'formula']);
  });

  it('still flags Unicode math text runs as formula', () => {
    const runs = [run('f(x) = x² + 1', { fontName: 'Times-Roman', fontSize: 12 })];
    expect(classifyRuns(runs)).toEqual(['formula']);
  });
});

describe('classifyMathParagraphFromParagraph + formula domination', () => {
  it('upgrades formula-dominated paragraphs to math', () => {
    const p = para('1-0', 'L(θ) = Σᵢ ℓ', {
      runs: [
        run('L(θ)', { fontName: 'CMMI10', fontSize: 11 }),
        run(' = ', { fontName: 'CMSY10', fontSize: 11 }),
        run('Σᵢ ℓ', { fontName: 'CMMI10', fontSize: 11 }),
      ],
    });
    expect(isFormulaDominated(p.runs!)).toBe(true);
    expect(classifyMathParagraphFromParagraph(p)).toBe('math');
  });

  it('keeps mixed prose-with-inline-formula as prose at paragraph level', () => {
    const p = para(
      '1-0',
      'The loss is L(theta) where the learning rate is used during training steps.',
      {
        runs: [
          run('The loss is ', { fontName: 'Times-Roman', fontSize: 12 }),
          run('L(theta)', { fontName: 'CMMI10', fontSize: 12 }),
          run(' where the learning rate is used during training steps.', {
            fontName: 'Times-Roman',
            fontSize: 12,
          }),
        ],
      },
    );
    expect(isFormulaDominated(p.runs!)).toBe(false);
    expect(classifyMathParagraphFromParagraph(p)).toBe('prose');
    expect(classifyRuns(p.runs!)).toEqual(['prose', 'formula', 'prose']);
  });

  it('existing Unicode/LaTeX text paths still pass without runs', () => {
    expect(classifyMathParagraph('f(x) = x² + 2x + 1')).toBe('math');
    expect(classifyMathParagraph('Consider $$\\sum_{i=1}^{n} x_i$$ above.')).toBe('math');
  });
});
