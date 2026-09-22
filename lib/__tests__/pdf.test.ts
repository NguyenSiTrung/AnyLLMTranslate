import { describe, expect, it } from 'vitest';
import {
  parsePageSelection,
  parsePagesSpec,
} from '../pdfPageSelection';
import { addPdfSiteException, normalizePdfSiteException } from '../pdfSiteExceptions';

describe('parsePagesSpec — syntax-only expansion (background/bridge parity)', () => {
  it('expands ranges, dedupes/sorts overlaps, tolerates whitespace, and rejects malformed input', () => {
    expect(parsePagesSpec('1-3, 5, 8-10')).toEqual([1, 2, 3, 5, 8, 9, 10]);
    expect(parsePagesSpec('5, 1-3, 3')).toEqual([1, 2, 3, 5]);
    expect(parsePagesSpec(' 1 - 3 ,\t5 ')).toEqual([1, 2, 3, 5]);

    for (const malformed of [
      '',
      '   ',
      'abc',
      '1,,2',
      '1-',
      '-5',
      '1;2',
      '5-2',
      '0',
      '1.5',
    ]) {
      expect(parsePagesSpec(malformed), malformed).toBeNull();
    }
  });
});

describe('parsePageSelection — UI validation with bounds', () => {
  it('accepts a valid selection and reports the exact error for each invalid shape', () => {
    expect(parsePageSelection('1-3, 5', 42)).toEqual({
      pages: [1, 2, 3, 5],
    });

    const cases: Array<[input: string, total: number, error: string]> = [
      ['', 42, 'Enter at least one page'],
      ['1, abc', 42, '"abc" is not a valid page or range'],
      ['5-2', 42, '"5-2" is not a valid page or range'],
      ['1, 99', 42, 'Page 99 is out of range (1-42)'],
      ['0', 42, 'Page numbers start at 1'],
    ];
    for (const [input, total, error] of cases) {
      const result = parsePageSelection(input, total);
      expect(result.pages, input).toEqual([]);
      expect(result.error, input).toBe(error);
    }

    // An unknown total (still loading) skips the upper-bound check.
    expect(parsePageSelection('99', 0)).toEqual({ pages: [99] });
  });
});

/**
 * Tests: PDF auto-open site-exception normalization — hostname extraction,
 * rejection of non-HTTP(S) input, and case-insensitive deduplication.
 */

describe('pdfSiteExceptions', () => {
  it('normalizes HTTP(S) hosts and rejects non-host input', () => {
    const accepted: Array<[input: string, expected: string]> = [
      ['arxiv.org', 'arxiv.org'],
      [' HTTPS://Example.COM/paper.pdf?x=1 ', 'example.com'],
      ['localhost:3000/file.pdf', 'localhost'],
    ];
    for (const [input, expected] of accepted) {
      expect(normalizePdfSiteException(input), input).toBe(expected);
    }

    for (const rejected of ['', 'not a host', 'file:///tmp/a.pdf', 'mailto:user@example.com']) {
      expect(normalizePdfSiteException(rejected), rejected).toBeNull();
    }
  });

  it('deduplicates case-insensitively without mutating existing order', () => {
    expect(addPdfSiteException(['arxiv.org'], 'ARXIV.ORG/paper')).toEqual([
      'arxiv.org',
    ]);
    expect(addPdfSiteException(['arxiv.org'], 'example.com')).toEqual([
      'arxiv.org',
      'example.com',
    ]);
  });
});
