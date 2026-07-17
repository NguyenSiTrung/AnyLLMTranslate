import { describe, it, expect } from 'vitest';
import {
  sortByReadingStripPriority,
  isHeadingElement,
  HEADING_TAGS,
} from '@/lib/readingStripPriority';

describe('readingStripPriority', () => {
  it('sorts by viewport, headings, originalIndex; detects heading tags', () => {
    expect(
      sortByReadingStripPriority([
        { id: 'low', viewportTop: 600, originalIndex: 0 },
        { id: 'top', viewportTop: 40, originalIndex: 1 },
        { id: 'mid', viewportTop: 300, originalIndex: 2 },
      ]).map((p) => p.id),
    ).toEqual(['top', 'mid', 'low']);

    expect(
      sortByReadingStripPriority([
        { id: 'body', viewportTop: 50, isHeading: false, originalIndex: 0 },
        { id: 'h', viewportTop: 60, isHeading: true, originalIndex: 1 },
      ]).map((p) => p.id),
    ).toEqual(['h', 'body']);

    expect(
      sortByReadingStripPriority([
        { id: 'second', viewportTop: 100, originalIndex: 1 },
        { id: 'first', viewportTop: 100, originalIndex: 0 },
      ]).map((p) => p.id),
    ).toEqual(['first', 'second']);

    const input = [
      { id: 'b', viewportTop: 200, originalIndex: 0 },
      { id: 'a', viewportTop: 10, originalIndex: 1 },
    ];
    const copy = [...input];
    sortByReadingStripPriority(input);
    expect(input).toEqual(copy);

    expect(HEADING_TAGS.has('H2')).toBe(true);
    expect(isHeadingElement({ tagName: 'H2' } as Element)).toBe(true);
    expect(isHeadingElement({ tagName: 'P' } as Element)).toBe(false);
    expect(isHeadingElement(null)).toBe(false);
  });
});
