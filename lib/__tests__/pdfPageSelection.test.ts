import { describe, expect, it } from 'vitest';

import {
  parsePageSelection,
  parsePagesSpec,
} from '../pdfPageSelection';

describe('parsePagesSpec — syntax-only expansion (background/bridge parity)', () => {
  it('expands ranges and single pages to 1-based sorted unique numbers', () => {
    expect(parsePagesSpec('1-3, 5, 8-10')).toEqual([1, 2, 3, 5, 8, 9, 10]);
  });

  it('dedupes and sorts overlapping input', () => {
    expect(parsePagesSpec('5, 1-3, 3')).toEqual([1, 2, 3, 5]);
  });

  it('tolerates whitespace inside tokens', () => {
    expect(parsePagesSpec(' 1 - 3 ,\t5 ')).toEqual([1, 2, 3, 5]);
  });

  it('returns null for malformed input', () => {
    expect(parsePagesSpec('')).toBeNull();
    expect(parsePagesSpec('   ')).toBeNull();
    expect(parsePagesSpec('abc')).toBeNull();
    expect(parsePagesSpec('1,,2')).toBeNull();
    expect(parsePagesSpec('1-')).toBeNull();
    expect(parsePagesSpec('-5')).toBeNull();
    expect(parsePagesSpec('1;2')).toBeNull();
    expect(parsePagesSpec('5-2')).toBeNull();
    expect(parsePagesSpec('0')).toBeNull();
    expect(parsePagesSpec('1.5')).toBeNull();
  });
});

describe('parsePageSelection — UI validation with bounds', () => {
  it('accepts a valid selection and returns the pages', () => {
    expect(parsePageSelection('1-3, 5', 42)).toEqual({
      pages: [1, 2, 3, 5],
    });
  });

  it('rejects empty input', () => {
    const result = parsePageSelection('', 42);
    expect(result.pages).toEqual([]);
    expect(result.error).toBe('Enter at least one page');
  });

  it('rejects malformed tokens', () => {
    const result = parsePageSelection('1, abc', 42);
    expect(result.pages).toEqual([]);
    expect(result.error).toBe('"abc" is not a valid page or range');
  });

  it('rejects reversed ranges', () => {
    const result = parsePageSelection('5-2', 42);
    expect(result.pages).toEqual([]);
    expect(result.error).toBe('"5-2" is not a valid page or range');
  });

  it('rejects pages above the document total', () => {
    const result = parsePageSelection('1, 99', 42);
    expect(result.pages).toEqual([]);
    expect(result.error).toBe('Page 99 is out of range (1-42)');
  });

  it('rejects page zero', () => {
    const result = parsePageSelection('0', 42);
    expect(result.pages).toEqual([]);
    expect(result.error).toBe('Page numbers start at 1');
  });

  it('skips the upper-bound check when the total is unknown', () => {
    expect(parsePageSelection('99', 0)).toEqual({ pages: [99] });
  });
});
