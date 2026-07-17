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

describe('placeholderToken', () => {
  it('uses stable {vN} format', () => {
    expect(placeholderToken(0)).toBe('{v0}');
    expect(placeholderToken(3)).toBe('{v3}');
  });
});

describe('buildTranslatePayload', () => {
  it('builds prose {v0} prose from mixed runs', () => {
    const p = para('The loss is L(theta) where rate.', [
      run('The loss is ', { fontName: 'Times-Roman' }),
      run('L(theta)', { fontName: 'CMMI10' }),
      run(' where rate.', { fontName: 'Times-Roman' }),
    ]);
    const payload = buildTranslatePayload(p);
    expect(payload.formulaOnly).toBe(false);
    expect(payload.hasPlaceholders).toBe(true);
    expect(payload.text).toContain('{v0}');
    expect(payload.text).not.toContain('L(theta)');
    expect(payload.placeholders).toHaveLength(1);
    expect(payload.placeholders[0].text).toBe('L(theta)');
    expect(payload.placeholders[0].token).toBe('{v0}');
  });

  it('collapses consecutive formula runs into one placeholder', () => {
    const p = para('See E = mc2 end.', [
      run('See ', { fontName: 'Times-Roman' }),
      run('E', { fontName: 'CMMI10' }),
      run('=', { fontName: 'CMSY10' }),
      run('mc2', { fontName: 'CMMI10' }),
      run(' end.', { fontName: 'Times-Roman' }),
    ]);
    const payload = buildTranslatePayload(p);
    expect(payload.placeholders).toHaveLength(1);
    expect(payload.placeholders[0].text).toBe('E=mc2');
    expect(payload.text).toMatch(/See \{v0\} end\./);
  });

  it('marks pure-formula paragraphs as formulaOnly (no LLM string needed)', () => {
    const p = para('L(theta) = sum', [
      run('L(theta)', { fontName: 'CMMI10' }),
      run(' = ', { fontName: 'CMSY10' }),
      run('sum', { fontName: 'CMMI10' }),
    ]);
    const payload = buildTranslatePayload(p);
    expect(payload.formulaOnly).toBe(true);
    expect(payload.hasPlaceholders).toBe(false);
  });

  it('returns original text when no runs', () => {
    const p = para('Just prose without runs.', []);
    p.runs = undefined;
    const payload = buildTranslatePayload(p);
    expect(payload.text).toBe('Just prose without runs.');
    expect(payload.hasPlaceholders).toBe(false);
  });
});

describe('stripHallucinatedPlaceholders + reassembleTranslation', () => {
  const placeholders = [
    {
      index: 0,
      token: '{v0}',
      text: 'L(θ)',
      runs: [run('L(θ)', { fontName: 'CMMI10' })],
    },
  ];

  it('strips invented {v9} not in map', () => {
    const cleaned = stripHallucinatedPlaceholders('Hello {v0} and {v9} world', placeholders);
    expect(cleaned).toBe('Hello {v0} and  world');
  });

  it('reinserts formula run text after translation', () => {
    const { displayText, compositions } = reassembleTranslation(
      'Mất mát là {v0} trong đó',
      placeholders,
    );
    expect(displayText).toBe('Mất mát là L(θ) trong đó');
    expect(compositions).toEqual([
      { kind: 'prose', text: 'Mất mát là ' },
      { kind: 'formula', text: 'L(θ)', runs: placeholders[0].runs },
      { kind: 'prose', text: ' trong đó' },
    ]);
  });

  it('appends formulas if model dropped all placeholders', () => {
    const { displayText, compositions } = reassembleTranslation(
      'The loss where rate',
      placeholders,
    );
    expect(displayText).toContain('L(θ)');
    expect(compositions.some((c) => c.kind === 'formula')).toBe(true);
  });
});

describe('getProseMaskRects — selective mask', () => {
  it('returns null for math/figure kinds', () => {
    const p = para('f(x)=1', [run('f(x)=1', { fontName: 'CMMI10' })]);
    expect(getProseMaskRects(p, 'math', 'f(x)=1')).toBeNull();
    expect(getProseMaskRects(p, 'figure', 'f(x)=1')).toBeNull();
  });

  it('masks only prose runs in mixed paragraphs', () => {
    const p = para('The loss is L(theta) end.', [
      run('The loss is ', { fontName: 'Times-Roman', x: 10, y: 100, width: 60, height: 12 }),
      run('L(theta)', { fontName: 'CMMI10', x: 70, y: 100, width: 40, height: 12 }),
      run(' end.', { fontName: 'Times-Roman', x: 110, y: 100, width: 30, height: 12 }),
    ]);
    const rects = getProseMaskRects(p, 'prose', 'Mat mat la L(theta) end.');
    expect(rects).not.toBeNull();
    expect(rects!.length).toBe(2);
    expect(rects!.every((r) => r.x !== 70)).toBe(true); // formula run at x=70 not masked
  });

  it('masks full paragraph for pure prose without formula runs', () => {
    const p = para('Hello world only.', [
      run('Hello world only.', { fontName: 'Times-Roman', x: 0, y: 50, width: 100, height: 12 }),
    ]);
    p.x = 0;
    p.y = 62;
    p.width = 100;
    p.height = 12;
    const rects = getProseMaskRects(p, 'prose', 'Xin chao.');
    expect(rects).toHaveLength(1);
    expect(rects![0]).toMatchObject({ x: 0, y: 62, width: 100, height: 12 });
  });

  it('failsafe: pure formula-font paragraph is never masked even without kind', () => {
    const p = para('L(theta)=sum x_i', [
      run('L(theta)=sum x_i', { fontName: 'CMMI10', x: 40, y: 200, width: 180, height: 14 }),
    ]);
    // kind omitted / prose — still must not white-mask (canvas math must show).
    expect(getProseMaskRects(p, undefined, 'L(theta)=sum x_i')).toBeNull();
    expect(getProseMaskRects(p, 'prose', 'translated garbage □□□')).toBeNull();
  });
});

describe('proseOnlyOverlayText', () => {
  it('returns full text when no compositions', () => {
    expect(proseOnlyOverlayText('Hello world', undefined)).toBe('Hello world');
    expect(proseOnlyOverlayText('Hello world', [])).toBe('Hello world');
  });

  it('strips formula segments so Layout can leave math on canvas', () => {
    const text = proseOnlyOverlayText('Mất mát là L(θ) trong đó', [
      { kind: 'prose', text: 'Mất mát là ' },
      { kind: 'formula', text: 'L(θ)' },
      { kind: 'prose', text: ' trong đó' },
    ]);
    expect(text).toBe('Mất mát là trong đó');
    expect(text).not.toContain('L(θ)');
  });

  it('returns empty when only formula segments (skip overlay box)', () => {
    expect(
      proseOnlyOverlayText('E=mc2', [{ kind: 'formula', text: 'E=mc2' }]),
    ).toBe('');
  });

  it('without compositions, strips formula-run substrings from original para', () => {
    const p = para('The loss is L(theta) end.', [
      run('The loss is ', { fontName: 'Times-Roman' }),
      run('L(theta)', { fontName: 'CMMI10' }),
      run(' end.', { fontName: 'Times-Roman' }),
    ]);
    const text = proseOnlyOverlayText('Mat mat la L(theta) ket thuc', undefined, p);
    expect(text).not.toContain('L(theta)');
    expect(text.toLowerCase()).toContain('mat');
  });
});

describe('display equation + tofu failsafes', () => {
  it('looksLikeDisplayEquation catches numbered paper equations', () => {
    const eq =
      'JPPO(θ) = E min(wi(θ)Âi, clip(wi(θ), 1−ε, 1+ε)Âi) , (1)';
    expect(looksLikeDisplayEquation(eq)).toBe(true);
  });

  it('looksLikeDisplayEquation catches ASCII min/clip objectives without low letter-ratio', () => {
    const eq =
      'JGSPO(θ)=E[1/G sum min(si(θ)Ai,clip(si(θ),1-e,1+e)Ai)], (5)';
    expect(looksLikeDisplayEquation(eq)).toBe(true);
  });

  it('hasUnsafeOverlayGlyphs detects tofu boxes', () => {
    expect(hasUnsafeOverlayGlyphs('Mất mát □□□ clip')).toBe(true);
    expect(hasUnsafeOverlayGlyphs('Chỉ có chữ Việt bình thường')).toBe(false);
  });

  it('shouldSkipLayoutOverlay for display equations even when kind is prose', () => {
    const eqText =
      'J(θ)=E[min(wÂ,clip(w,1-ε,1+ε)Â)], (1)';
    const p = para(eqText, [run(eqText, { fontName: 'Times-Roman', x: 40, width: 400 })]);
    expect(shouldSkipLayoutOverlay(p, 'prose', 'bản dịch rác □□ clip (1)')).toBe(true);
    expect(getProseMaskRects(p, 'prose', 'bản dịch rác □□ clip (1)')).toBeNull();
  });

  it('strips trailing equation from merged prose+formula overlay text', () => {
    const merged =
      'GSPO employs the following sequence-level optimization objective: JGSPO(θ)=E[min(siAi,clip)], (5)';
    const p = para(merged, [run(merged, { fontName: 'Times-Roman' })]);
    // Should not skip whole para (has prose), but overlay text must drop equation.
    expect(shouldSkipLayoutOverlay(p, 'prose', 'Viet intro: □□□ rác (5)')).toBe(false);
    const overlay = proseOnlyOverlayText('Viet intro objective: □□□ rác công thức (5)', undefined, p);
    expect(overlay.toLowerCase()).toMatch(/viet|objective/);
    expect(overlay).not.toMatch(/□□□/);
  });
});
