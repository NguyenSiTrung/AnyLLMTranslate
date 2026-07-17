/**
 * Typesetting ladder pure API — BabelDOC-inspired fit / scale / expand.
 * Methodology only; no AGPL source.
 */

import { describe, it, expect } from 'vitest';
import {
  fitTextToBox,
  type TypesettingBox,
  type FontMetricsHook,
  type FreeSpace,
} from '../pdfTypesetting';

/** Simple monospace-style metrics: char width = 0.5 * fontSize. */
function makeSimpleMetrics(charWidthFactor = 0.5): FontMetricsHook {
  return {
    measure({ text, fontSize, lineHeight, width }) {
      const words = text.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) return { lines: [''], height: fontSize * lineHeight };

      const charW = fontSize * charWidthFactor;
      const spaceW = charW;
      const lines: string[] = [];
      let current = '';
      let currentW = 0;

      for (const word of words) {
        const wordW = word.length * charW;
        if (current === '') {
          current = word;
          currentW = wordW;
          continue;
        }
        if (currentW + spaceW + wordW <= width) {
          current += ` ${word}`;
          currentW += spaceW + wordW;
        } else {
          lines.push(current);
          current = word;
          currentW = wordW;
        }
      }
      if (current) lines.push(current);

      const height = lines.length * fontSize * lineHeight;
      return { lines, height };
    },
  };
}

const baseBox: TypesettingBox = { x: 50, y: 100, width: 200, height: 40 };

describe('fitTextToBox — typesetting ladder', () => {
  const metrics = makeSimpleMetrics();

  it('uses natural fit when text is short enough', () => {
    const result = fitTextToBox({
      box: baseBox,
      text: 'Short text',
      naturalFontSize: 12,
      metrics,
    });

    expect(result.overflow).toBe(false);
    expect(result.fontSize).toBe(12);
    expect(result.lineHeight).toBeCloseTo(1.45, 2);
    expect(result.box).toEqual(baseBox);
    expect(result.lines.length).toBeGreaterThanOrEqual(1);
    expect(result.lines.join(' ')).toContain('Short');
  });

  it('reduces line spacing when slightly too tall at natural size', () => {
    // Controlled: 3 lines of monospace text.
    // fontSize=10, charW=5, width=100 → "aaaaa aaaaa" (11 chars) wraps to 1 line
    // Use three full lines worth of words so height = 3 * fs * lh.
    // natural: 3 * 10 * 1.45 = 43.5; min lh: 3 * 10 * 1.05 = 31.5
    // Box height 36 → natural overflows, compact line-height fits without scale.
    const text = 'aaaaa aaaaa aaaaa aaaaa aaaaa aaaaa';
    const box: TypesettingBox = { x: 0, y: 0, width: 55, height: 36 };
    const fontSize = 10;

    const natural = metrics.measure({
      text,
      fontSize,
      lineHeight: 1.45,
      width: box.width,
    });
    const compact = metrics.measure({
      text,
      fontSize,
      lineHeight: 1.05,
      width: box.width,
    });
    expect(natural.height).toBeGreaterThan(box.height);
    expect(compact.height).toBeLessThanOrEqual(box.height);

    const result = fitTextToBox({
      box,
      text,
      naturalFontSize: fontSize,
      metrics,
    });

    expect(result.overflow).toBe(false);
    expect(result.fontSize).toBe(fontSize);
    expect(result.lineHeight).toBeLessThan(1.45);
    expect(result.lineHeight).toBeGreaterThanOrEqual(1.05);
  });

  it('scales font down when still overflowing after line-spacing reduce', () => {
    const text = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
    const box: TypesettingBox = { x: 0, y: 0, width: 100, height: 40 };

    const result = fitTextToBox({
      box,
      text,
      naturalFontSize: 14,
      metrics,
    });

    expect(result.overflow).toBe(false);
    expect(result.fontSize).toBeLessThan(14);
    expect(result.fontSize).toBeGreaterThanOrEqual(14 * 0.1 - 1e-6);
  });

  it('expands box into free space when neighbors allow', () => {
    const text = Array.from({ length: 60 }, (_, i) => `item${i}`).join(' ');
    const box: TypesettingBox = { x: 10, y: 20, width: 80, height: 36 };
    const freeSpace: FreeSpace = { right: 120, down: 0 };

    const result = fitTextToBox({
      box,
      text,
      naturalFontSize: 12,
      metrics,
      freeSpace,
    });

    expect(result.overflow).toBe(false);
    expect(result.box.width).toBeGreaterThan(box.width);
    expect(result.box.width).toBeLessThanOrEqual(box.width + freeSpace.right!);
  });

  it('sets overflow true when text cannot fit even at hard min scale', () => {
    const text = Array.from({ length: 400 }, (_, i) => `longword${i}`).join(' ');
    const box: TypesettingBox = { x: 0, y: 0, width: 40, height: 12 };

    const result = fitTextToBox({
      box,
      text,
      naturalFontSize: 12,
      metrics,
      freeSpace: { right: 0, down: 0 },
    });

    expect(result.overflow).toBe(true);
    expect(result.fontSize).toBeCloseTo(12 * 0.1, 5);
    // Never goes below hard min
    expect(result.fontSize).toBeGreaterThanOrEqual(12 * 0.1 - 1e-9);
  });

  it('never scales below hard min without overflow flag', () => {
    const text = 'x'.repeat(5000);
    const box: TypesettingBox = { x: 0, y: 0, width: 30, height: 10 };

    const result = fitTextToBox({
      box,
      text,
      naturalFontSize: 20,
      metrics: makeSimpleMetrics(0.6),
    });

    expect(result.fontSize).toBeGreaterThanOrEqual(20 * 0.1 - 1e-9);
    if (result.fontSize <= 20 * 0.1 + 1e-6) {
      // At hard floor: must report overflow if still does not fit
      const check = metrics.measure({
        text,
        fontSize: result.fontSize,
        lineHeight: result.lineHeight,
        width: result.box.width,
      });
      if (check.height > result.box.height) {
        expect(result.overflow).toBe(true);
      }
    }
  });
});
