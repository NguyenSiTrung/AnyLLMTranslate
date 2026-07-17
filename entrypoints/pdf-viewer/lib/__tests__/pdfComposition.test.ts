/**
 * Unit tests for formula placeholder build / reinsert / hallucination strip.
 */
import { describe, it, expect } from 'vitest';
import {
  buildTranslatePayload,
  getProseMaskRects,
  proseOnlyOverlayText,
  reassembleTranslation,
  shouldSkipLayoutOverlay,
  stripHallucinatedPlaceholders,
  placeholderToken,
} from '../pdfComposition';
import { looksLikeDisplayEquation, hasUnsafeOverlayGlyphs } from '../pdfContentDetect';
import type { PdfParagraph, PdfTextRun } from '../pdfTextExtraction';

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

function para(text: string, runs: PdfTextRun[]): PdfParagraph {
  return {
    id: '1-0',
    text,
    fontSize: 12,
    isHeading: false,
    x: 0,
    y: 100,
    width: 200,
    height: 12,
    runs,
  };
}

describe('pdfComposition', () => {
  it('placeholder tokens and buildTranslatePayload for mixed/pure/no-run paragraphs', () => {
    expect(placeholderToken(0)).toBe('{v0}');
    expect(placeholderToken(3)).toBe('{v3}');

    const mixed = para('The loss is L(theta) where rate.', [
      run('The loss is ', { fontName: 'Times-Roman' }),
      run('L(theta)', { fontName: 'CMMI10' }),
      run(' where rate.', { fontName: 'Times-Roman' }),
    ]);
    const mixedPayload = buildTranslatePayload(mixed);
    expect(mixedPayload.formulaOnly).toBe(false);
    expect(mixedPayload.hasPlaceholders).toBe(true);
    expect(mixedPayload.text).toContain('{v0}');
    expect(mixedPayload.text).not.toContain('L(theta)');
    expect(mixedPayload.placeholders).toHaveLength(1);
    expect(mixedPayload.placeholders[0].text).toBe('L(theta)');
    expect(mixedPayload.placeholders[0].token).toBe('{v0}');

    const collapsed = para('See E = mc2 end.', [
      run('See ', { fontName: 'Times-Roman' }),
      run('E', { fontName: 'CMMI10' }),
      run('=', { fontName: 'CMSY10' }),
      run('mc2', { fontName: 'CMMI10' }),
      run(' end.', { fontName: 'Times-Roman' }),
    ]);
    const collapsedPayload = buildTranslatePayload(collapsed);
    expect(collapsedPayload.placeholders).toHaveLength(1);
    expect(collapsedPayload.placeholders[0].text).toBe('E=mc2');
    expect(collapsedPayload.text).toMatch(/See \{v0\} end\./);

    const pure = para('L(theta) = sum', [
      run('L(theta)', { fontName: 'CMMI10' }),
      run(' = ', { fontName: 'CMSY10' }),
      run('sum', { fontName: 'CMMI10' }),
    ]);
    const purePayload = buildTranslatePayload(pure);
    expect(purePayload.formulaOnly).toBe(true);
    expect(purePayload.hasPlaceholders).toBe(false);

    const noRuns = para('Just prose without runs.', []);
    noRuns.runs = undefined;
    const bare = buildTranslatePayload(noRuns);
    expect(bare.text).toBe('Just prose without runs.');
    expect(bare.hasPlaceholders).toBe(false);
  });

  it('strip hallucinations and reassembleTranslation insert/append formulas', () => {
    const placeholders = [
      {
        index: 0,
        token: '{v0}',
        text: 'L(θ)',
        runs: [run('L(θ)', { fontName: 'CMMI10' })],
      },
    ];
    expect(stripHallucinatedPlaceholders('Hello {v0} and {v9} world', placeholders)).toBe(
      'Hello {v0} and  world',
    );

    const reassembled = reassembleTranslation('Mất mát là {v0} trong đó', placeholders);
    expect(reassembled.displayText).toBe('Mất mát là L(θ) trong đó');
    expect(reassembled.compositions).toEqual([
      { kind: 'prose', text: 'Mất mát là ' },
      { kind: 'formula', text: 'L(θ)', runs: placeholders[0].runs },
      { kind: 'prose', text: ' trong đó' },
    ]);

    const dropped = reassembleTranslation('The loss where rate', placeholders);
    expect(dropped.displayText).toContain('L(θ)');
    expect(dropped.compositions.some((c) => c.kind === 'formula')).toBe(true);
  });

  it('getProseMaskRects selective mask and formula failsafe', () => {
    const formula = para('f(x)=1', [run('f(x)=1', { fontName: 'CMMI10' })]);
    expect(getProseMaskRects(formula, 'math', 'f(x)=1')).toBeNull();
    expect(getProseMaskRects(formula, 'figure', 'f(x)=1')).toBeNull();

    const mixed = para('The loss is L(theta) end.', [
      run('The loss is ', { fontName: 'Times-Roman', x: 10, y: 100, width: 60, height: 12 }),
      run('L(theta)', { fontName: 'CMMI10', x: 70, y: 100, width: 40, height: 12 }),
      run(' end.', { fontName: 'Times-Roman', x: 110, y: 100, width: 30, height: 12 }),
    ]);
    const rects = getProseMaskRects(mixed, 'prose', 'Mat mat la L(theta) end.');
    expect(rects).not.toBeNull();
    expect(rects!.length).toBe(2);
    expect(rects!.every((r) => r.x !== 70)).toBe(true);

    const pureProse = para('Hello world only.', [
      run('Hello world only.', { fontName: 'Times-Roman', x: 0, y: 50, width: 100, height: 12 }),
    ]);
    pureProse.x = 0;
    pureProse.y = 62;
    pureProse.width = 100;
    pureProse.height = 12;
    expect(getProseMaskRects(pureProse, 'prose', 'Xin chao.')).toEqual([
      expect.objectContaining({ x: 0, y: 62, width: 100, height: 12 }),
    ]);

    const pureFormula = para('L(theta)=sum x_i', [
      run('L(theta)=sum x_i', { fontName: 'CMMI10', x: 40, y: 200, width: 180, height: 14 }),
    ]);
    expect(getProseMaskRects(pureFormula, undefined, 'L(theta)=sum x_i')).toBeNull();
    expect(getProseMaskRects(pureFormula, 'prose', 'translated garbage □□□')).toBeNull();
  });

  it('proseOnlyOverlayText strips formulas and tofu-safe display equations', () => {
    expect(proseOnlyOverlayText('Hello world', undefined)).toBe('Hello world');
    expect(proseOnlyOverlayText('Hello world', [])).toBe('Hello world');
    expect(
      proseOnlyOverlayText('Mất mát là L(θ) trong đó', [
        { kind: 'prose', text: 'Mất mát là ' },
        { kind: 'formula', text: 'L(θ)' },
        { kind: 'prose', text: ' trong đó' },
      ]),
    ).toBe('Mất mát là trong đó');
    expect(proseOnlyOverlayText('E=mc2', [{ kind: 'formula', text: 'E=mc2' }])).toBe('');

    const withRuns = para('The loss is L(theta) end.', [
      run('The loss is ', { fontName: 'Times-Roman' }),
      run('L(theta)', { fontName: 'CMMI10' }),
      run(' end.', { fontName: 'Times-Roman' }),
    ]);
    const stripped = proseOnlyOverlayText('Mat mat la L(theta) ket thuc', undefined, withRuns);
    expect(stripped).not.toContain('L(theta)');
    expect(stripped.toLowerCase()).toContain('mat');

    const numbered =
      'JPPO(θ) = E min(wi(θ)Âi, clip(wi(θ), 1−ε, 1+ε)Âi) , (1)';
    expect(looksLikeDisplayEquation(numbered)).toBe(true);
    expect(
      looksLikeDisplayEquation(
        'JGSPO(θ)=E[1/G sum min(si(θ)Ai,clip(si(θ),1-e,1+e)Ai)], (5)',
      ),
    ).toBe(true);
    expect(hasUnsafeOverlayGlyphs('Mất mát □□□ clip')).toBe(true);
    expect(hasUnsafeOverlayGlyphs('Chỉ có chữ Việt bình thường')).toBe(false);

    const eqText = 'J(θ)=E[min(wÂ,clip(w,1-ε,1+ε)Â)], (1)';
    const eqPara = para(eqText, [run(eqText, { fontName: 'Times-Roman', x: 40, width: 400 })]);
    expect(shouldSkipLayoutOverlay(eqPara, 'prose', 'bản dịch rác □□ clip (1)')).toBe(true);
    expect(getProseMaskRects(eqPara, 'prose', 'bản dịch rác □□ clip (1)')).toBeNull();

    const merged =
      'GSPO employs the following sequence-level optimization objective: JGSPO(θ)=E[min(siAi,clip)], (5)';
    const mergedPara = para(merged, [run(merged, { fontName: 'Times-Roman' })]);
    expect(shouldSkipLayoutOverlay(mergedPara, 'prose', 'Viet intro: □□□ rác (5)')).toBe(false);
    const overlay = proseOnlyOverlayText(
      'Viet intro objective: □□□ rác công thức (5)',
      undefined,
      mergedPara,
    );
    expect(overlay.toLowerCase()).toMatch(/viet|objective/);
    expect(overlay).not.toMatch(/□□□/);
  });
});
