/**
 * Tests for the in-memory PDF page cache helpers.
 *
 * Validates the simple get/set/clear lifecycle. The cache is module-scoped,
 * so the `clearMemoryCache()` call in `beforeEach` is essential.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getMemoryCachedPage,
  setMemoryCachedPage,
  clearMemoryCache,
} from '../pdfTranslation';

beforeEach(() => {
  clearMemoryCache();
});

describe('pdfTranslation memory cache', () => {
  it('returns null when nothing is cached', () => {
    expect(getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi')).toBeNull();
  });

  it('round-trips a page translation through the cache', () => {
    const map = new Map<string, string>([
      ['1-0', 'Xin chào'],
      ['1-1', 'Thế giới'],
    ]);
    setMemoryCachedPage('https://example.com/a.pdf', 1, map, 'en', 'vi');
    const cached = getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi');
    expect(cached).not.toBeNull();
    expect(cached?.get('1-0')).toBe('Xin chào');
    expect(cached?.get('1-1')).toBe('Thế giới');
  });

  it('isolates pages from each other', () => {
    const page1 = new Map<string, string>([['1-0', 'Page one']]);
    const page2 = new Map<string, string>([['2-0', 'Page two']]);
    setMemoryCachedPage('https://example.com/a.pdf', 1, page1, 'en', 'vi');
    setMemoryCachedPage('https://example.com/a.pdf', 2, page2, 'en', 'vi');
    expect(getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi')?.get('1-0')).toBe('Page one');
    expect(getMemoryCachedPage('https://example.com/a.pdf', 2, 'en', 'vi')?.get('2-0')).toBe('Page two');
  });

  it('isolates caches by (url, source, target) tuple', () => {
    const map = new Map<string, string>([['1-0', 'Hola']]);
    setMemoryCachedPage('https://example.com/a.pdf', 1, map, 'en', 'es');
    setMemoryCachedPage('https://example.com/a.pdf', 1, map, 'en', 'vi');
    expect(getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'es')?.get('1-0')).toBe('Hola');
    expect(getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi')?.get('1-0')).toBe('Hola');
    // Different document URLs are independent
    setMemoryCachedPage('https://example.com/b.pdf', 1, map, 'en', 'es');
    expect(getMemoryCachedPage('https://example.com/b.pdf', 1, 'en', 'es')).not.toBeNull();
  });

  it('returns a copy, not the original map reference', () => {
    const map = new Map<string, string>([['1-0', 'Original']]);
    setMemoryCachedPage('https://example.com/a.pdf', 1, map, 'en', 'vi');
    const cached = getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi');
    // Mutating the cached map should not affect the originally stored map
    cached?.set('1-0', 'Mutated');
    expect(map.get('1-0')).toBe('Original');
  });

  it('clearMemoryCache empties every entry', () => {
    setMemoryCachedPage('https://example.com/a.pdf', 1, new Map([['1-0', 'X']]), 'en', 'vi');
    setMemoryCachedPage('https://example.com/b.pdf', 1, new Map([['1-0', 'Y']]), 'en', 'vi');
    clearMemoryCache();
    expect(getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi')).toBeNull();
    expect(getMemoryCachedPage('https://example.com/b.pdf', 1, 'en', 'vi')).toBeNull();
  });
});
