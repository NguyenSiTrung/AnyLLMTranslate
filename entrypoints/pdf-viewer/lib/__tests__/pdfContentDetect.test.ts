/**
 * Unit tests for pure PDF content detection (math + table-like figure rules).
 */
import { describe, it, expect } from 'vitest';
import {
  classifyMathParagraph,
  classifyMathParagraphFromParagraph,
  classifyRuns,
  classifyTableLikeParagraphs,
  classifyTableRegions,
  isFormulaDominated,
  isFormulaFontName,
  isObviouslyProse,
  isProtectedTableCell,
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

describe('pdfContentDetect', () => {
  it('classifyMathParagraph flags equations and keeps mixed prose', () => {
    expect(classifyMathParagraph('f(x) = x² + 2x + 1')).toBe('math');
    expect(classifyMathParagraph('L(θ) = Σᵢ ℓ(yᵢ, ŷᵢ)')).toBe('math');
    const italicX = '\u{1D465}';
    const italicY = '\u{1D466}';
    expect(classifyMathParagraph(`${italicX} = ${italicY} + 1`)).toBe('math');
    const longEq =
      'E[L] = ∫ ℓ(y, f(x)) dP(x, y) ≈ (1/n) Σᵢ₌₁ⁿ ℓ(yᵢ, f(xᵢ)) subject to ‖w‖₂ ≤ C';
    expect(classifyMathParagraph(longEq)).toBe('math');
    expect(classifyMathParagraph('E = mc^2')).toBe('math');
    expect(classifyMathParagraph('a_i = b_j + c_k')).toBe('math');
    expect(
      classifyMathParagraph(
        'The loss L(θ) = Σᵢ ℓ is minimized over the training set using SGD.',
      ),
    ).toBe('prose');
    expect(classifyMathParagraph('Consider $$\\sum_{i=1}^{n} x_i$$ above.')).toBe('math');
  });

  it('classifyTableLikeParagraphs marks numeric/grid cells and not isolated prose', () => {
    const numeric = classifyTableLikeParagraphs([
      para('1-0', '98.5%'),
      para('1-1', '$1,234'),
      para('1-2', '42'),
      para('1-3', 'This is a normal full sentence of running prose about results.'),
    ]);
    expect(numeric.has('1-0')).toBe(true);
    expect(numeric.has('1-1')).toBe(true);
    expect(numeric.has('1-2')).toBe(true);
    expect(numeric.has('1-3')).toBe(false);

    const row = classifyTableLikeParagraphs([
      para('1-0', 'Model', { x: 50, y: 700, width: 40 }),
      para('1-1', 'Acc', { x: 120, y: 700, width: 30 }),
      para('1-2', 'F1', { x: 180, y: 700, width: 30 }),
      para('1-3', 'We evaluate three models on the benchmark suite.', {
        x: 50,
        y: 650,
        width: 400,
      }),
    ]);
    expect(row.has('1-0')).toBe(true);
    expect(row.has('1-1')).toBe(true);
    expect(row.has('1-2')).toBe(true);
    expect(row.has('1-3')).toBe(false);

    const grid = classifyTableLikeParagraphs([
      para('1-0', 'Train', { x: 50, y: 700, width: 40 }),
      para('1-1', '0.91', { x: 150, y: 700, width: 40 }),
      para('1-2', 'Test', { x: 50, y: 680, width: 40 }),
      para('1-3', '0.88', { x: 150, y: 680, width: 40 }),
      para('1-4', 'The table above reports mean accuracy.', {
        x: 50,
        y: 620,
        width: 400,
      }),
    ]);
    expect(grid.has('1-0')).toBe(true);
    expect(grid.has('1-1')).toBe(true);
    expect(grid.has('1-2')).toBe(true);
    expect(grid.has('1-3')).toBe(true);
    expect(grid.has('1-4')).toBe(false);

    const isolated = classifyTableLikeParagraphs([
      para('1-0', 'Abstract', { x: 50, y: 700, width: 80, isHeading: true }),
      para('1-1', 'Deep learning has transformed computer vision research significantly over the last decade.', {
        x: 50,
        y: 650,
        width: 400,
      }),
    ]);
    expect(isolated.has('1-0')).toBe(false);
    expect(isolated.has('1-1')).toBe(false);
  });

  it('classifyTableRegions assigns regions, excludes prose/captions, protects numeric cells', () => {
    const gridParas = [
      para('1-0', 'Train', { x: 50, y: 700, width: 40 }),
      para('1-1', '0.91', { x: 150, y: 700, width: 40 }),
      para('1-2', 'Test', { x: 50, y: 680, width: 40 }),
      para('1-3', '0.88', { x: 150, y: 680, width: 40 }),
      para('1-4', 'The table above reports mean accuracy across three seeds carefully.', {
        x: 50,
        y: 620,
        width: 400,
      }),
    ];
    const { regions, figureIds, regionParagraphIds } = classifyTableRegions(gridParas);
    expect(regions.length).toBeGreaterThanOrEqual(1);
    expect(regionParagraphIds.has('1-0')).toBe(true);
    expect(regionParagraphIds.has('1-1')).toBe(true);
    expect(figureIds.has('1-0')).toBe(true);
    expect(figureIds.has('1-3')).toBe(true);
    expect(regionParagraphIds.has('1-4')).toBe(false);
    expect(figureIds.has('1-4')).toBe(false);

    const caption = classifyTableRegions([
      para('1-0', 'A', { x: 50, y: 700, width: 20 }),
      para('1-1', 'B', { x: 100, y: 700, width: 20 }),
      para('1-2', 'C', { x: 150, y: 700, width: 20 }),
      para('1-3', 'Table 1: Results of the main experiment on the test split.', {
        x: 50,
        y: 660,
        width: 350,
      }),
    ]);
    expect(caption.figureIds.has('1-0')).toBe(true);
    expect(caption.figureIds.has('1-3')).toBe(false);

    expect(isProtectedTableCell('98.5%')).toBe(true);
    expect(isProtectedTableCell('Model')).toBe(false);
  });

  it('prose/formula helpers and classifyRuns size/font rules', () => {
    expect(
      isObviouslyProse(
        'Deep learning has transformed computer vision research significantly over the last decade with large models.',
      ),
    ).toBe(true);
    expect(isObviouslyProse('Accuracy')).toBe(false);

    for (const name of [
      'CMMI10',
      'CMSY8',
      'CMEX10',
      'MSBM10',
      'STIXMath-Regular',
      'CambriaMath',
      'Symbol',
      'g_d0_CMMI10',
    ]) {
      expect(isFormulaFontName(name)).toBe(true);
    }
    expect(isFormulaFontName('Times-Roman')).toBe(false);
    expect(isFormulaFontName('Helvetica')).toBe(false);
    expect(isFormulaFontName('g_d0_f1')).toBe(false);
    expect(isFormulaFontName('')).toBe(false);
    expect(isFormulaFontName('CMR10')).toBe(false);

    expect(
      classifyRuns([
        run('The loss is ', { fontName: 'Times-Roman', fontSize: 12 }),
        run('L(theta)', { fontName: 'CMMI10', fontSize: 12 }),
        run(' where the rate is used.', { fontName: 'Times-Roman', fontSize: 12 }),
      ]),
    ).toEqual(['prose', 'formula', 'prose']);

    expect(
      classifyRuns([
        run('index ', { fontName: 'Times-Roman', fontSize: 12, height: 12 }),
        run('i', { fontName: 'Times-Roman', fontSize: 8, height: 8 }),
        run(' of the vector', { fontName: 'Times-Roman', fontSize: 12, height: 12 }),
      ]),
    ).toEqual(['prose', 'formula', 'prose']);

    const slight = [
      run('Hello world text', { fontName: 'Times-Roman', fontSize: 12 }),
      run(' slightly smaller', { fontName: 'Times-Roman', fontSize: 10 }),
    ];
    expect(classifyRuns(slight)).toEqual(['prose', 'prose']);
    expect(classifyRuns(slight, { strictMath: true })).toEqual(['prose', 'formula']);
    expect(classifyRuns([run('f(x) = x² + 1', { fontName: 'Times-Roman', fontSize: 12 })])).toEqual([
      'formula',
    ]);
  });

  it('classifyMathParagraphFromParagraph upgrades formula-dominated paragraphs', () => {
    const dominated = para('1-0', 'L(θ) = Σᵢ ℓ', {
      runs: [
        run('L(θ)', { fontName: 'CMMI10', fontSize: 11 }),
        run(' = ', { fontName: 'CMSY10', fontSize: 11 }),
        run('Σᵢ ℓ', { fontName: 'CMMI10', fontSize: 11 }),
      ],
    });
    expect(isFormulaDominated(dominated.runs!)).toBe(true);
    expect(classifyMathParagraphFromParagraph(dominated)).toBe('math');

    const mixed = para(
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
    expect(isFormulaDominated(mixed.runs!)).toBe(false);
    expect(classifyMathParagraphFromParagraph(mixed)).toBe('prose');
    expect(classifyRuns(mixed.runs!)).toEqual(['prose', 'formula', 'prose']);

    expect(classifyMathParagraph('f(x) = x² + 2x + 1')).toBe('math');
    expect(classifyMathParagraph('Consider $$\\sum_{i=1}^{n} x_i$$ above.')).toBe('math');
  });
});
