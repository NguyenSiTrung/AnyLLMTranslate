import { describe, it, expect } from 'vitest';
import {
  sortByReadingStripPriority,
  isHeadingElement,
  HEADING_TAGS,
} from '@/lib/readingStripPriority';

describe('sortByReadingStripPriority', () => {
  it('orders top-of-fold pieces before lower ones', () => {
    const sorted = sortByReadingStripPriority([
      { id: 'low', viewportTop: 600, originalIndex: 0 },
      { id: 'top', viewportTop: 40, originalIndex: 1 },
      { id: 'mid', viewportTop: 300, originalIndex: 2 },
    ]);
    expect(sorted.map((p) => p.id)).toEqual(['top', 'mid', 'low']);
  });

  it('prefers headings within the same vertical band', () => {
    const sorted = sortByReadingStripPriority([
      { id: 'body', viewportTop: 50, isHeading: false, originalIndex: 0 },
      { id: 'h', viewportTop: 60, isHeading: true, originalIndex: 1 },
    ]);
    expect(sorted.map((p) => p.id)).toEqual(['h', 'body']);
  });

  it('is stable for equal geometry via originalIndex', () => {
    const sorted = sortByReadingStripPriority([
      { id: 'second', viewportTop: 100, originalIndex: 1 },
      { id: 'first', viewportTop: 100, originalIndex: 0 },
    ]);
    expect(sorted.map((p) => p.id)).toEqual(['first', 'second']);
  });

  it('does not mutate the input array', () => {
    const input = [
      { id: 'b', viewportTop: 200, originalIndex: 0 },
      { id: 'a', viewportTop: 10, originalIndex: 1 },
    ];
    const copy = [...input];
    sortByReadingStripPriority(input);
    expect(input).toEqual(copy);
  });
});

describe('isHeadingElement / HEADING_TAGS', () => {
  it('recognizes H1–H6 via tagName', () => {
    expect(HEADING_TAGS.has('H2')).toBe(true);
    expect(isHeadingElement({ tagName: 'H2' } as Element)).toBe(true);
    expect(isHeadingElement({ tagName: 'P' } as Element)).toBe(false);
    expect(isHeadingElement(null)).toBe(false);
  });
});
