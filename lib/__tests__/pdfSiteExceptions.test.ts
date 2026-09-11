/**
 * Tests: PDF auto-open site-exception normalization — hostname extraction,
 * rejection of non-HTTP(S) input, and case-insensitive deduplication.
 */
import { describe, expect, it } from 'vitest';
import { addPdfSiteException, normalizePdfSiteException } from '../pdfSiteExceptions';

describe('pdfSiteExceptions', () => {
  it.each([
    ['arxiv.org', 'arxiv.org'],
    [' HTTPS://Example.COM/paper.pdf?x=1 ', 'example.com'],
    ['localhost:3000/file.pdf', 'localhost'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePdfSiteException(input)).toBe(expected);
  });

  it.each(['', 'not a host', 'file:///tmp/a.pdf', 'mailto:user@example.com'])(
    'rejects %s',
    (input) => {
      expect(normalizePdfSiteException(input)).toBeNull();
    },
  );

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
