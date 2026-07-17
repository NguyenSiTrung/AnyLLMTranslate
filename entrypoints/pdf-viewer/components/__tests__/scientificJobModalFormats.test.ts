import { describe, it, expect } from 'vitest';
import {
  availableFormats,
  defaultFormat,
  formatCardCopy,
  openResultPrefer,
  isRecommended,
} from '../scientificJobModalFormats';

describe('scientificJobModalFormats', () => {
  it('lists only available formats', () => {
    expect(availableFormats({ hasMono: true, hasDual: true })).toEqual([
      'side-by-side',
      'dual',
      'mono',
    ]);
    expect(availableFormats({ hasMono: true, hasDual: false })).toEqual([
      'side-by-side',
      'mono',
    ]);
    expect(availableFormats({ hasMono: false, hasDual: true })).toEqual(['dual']);
    expect(availableFormats({ hasMono: false, hasDual: false })).toEqual([]);
  });

  it('defaults to side-by-side when mono exists', () => {
    expect(defaultFormat({ hasMono: true, hasDual: true })).toBe('side-by-side');
    expect(defaultFormat({ hasMono: true, hasDual: false })).toBe('side-by-side');
  });

  it('falls back dual then mono', () => {
    expect(defaultFormat({ hasMono: false, hasDual: true })).toBe('dual');
    expect(defaultFormat({ hasMono: false, hasDual: false })).toBe(null);
  });

  it('uses plain-language copy without pdf2zh or L|R', () => {
    for (const f of ['mono', 'dual', 'side-by-side'] as const) {
      const c = formatCardCopy(f);
      const blob = `${c.title} ${c.hint} ${c.downloadLabel}`;
      expect(blob.toLowerCase()).not.toMatch(/pdf2zh/);
      expect(blob).not.toMatch(/L\|R/i);
    }
    expect(formatCardCopy('side-by-side').downloadLabel).toMatch(/side-by-side/i);
    expect(formatCardCopy('dual').title.toLowerCase()).toMatch(/bilingual|bridge/);
    expect(formatCardCopy('mono').title.toLowerCase()).toMatch(/translated/);
  });

  it('maps open prefer correctly', () => {
    expect(openResultPrefer('dual', { hasMono: true, hasDual: true })).toBe('dual');
    expect(openResultPrefer('side-by-side', { hasMono: true, hasDual: true })).toBe('mono');
    expect(openResultPrefer('mono', { hasMono: true, hasDual: false })).toBe('mono');
    expect(openResultPrefer('dual', { hasMono: false, hasDual: false })).toBe(null);
    expect(openResultPrefer(null, { hasMono: true, hasDual: true })).toBe('mono');
  });

  it('marks side-by-side recommended only when it is the default', () => {
    expect(isRecommended('side-by-side', { hasMono: true, hasDual: true })).toBe(true);
    expect(isRecommended('dual', { hasMono: true, hasDual: true })).toBe(false);
    expect(isRecommended('dual', { hasMono: false, hasDual: true })).toBe(true);
  });
});
