/**
 * Tests for shared DOM utility functions.
 */

import { describe, it, expect } from 'vitest';
import { deduplicateAncestors } from '@/lib/domUtils';

describe('deduplicateAncestors', () => {
  it('returns the input unchanged for empty or single-element arrays', () => {
    expect(deduplicateAncestors([])).toEqual([]);
    const el = document.createElement('div');
    expect(deduplicateAncestors([el])).toEqual([el]);
  });

  it('removes an element contained by another in the list', () => {
    const outer = document.createElement('div');
    const inner = document.createElement('span');
    outer.appendChild(inner);

    const result = deduplicateAncestors([outer, inner]);
    expect(result).toEqual([outer]);
  });

  it('keeps sibling elements that do not contain each other', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.appendChild(a);
    document.body.appendChild(b);

    const result = deduplicateAncestors([a, b]);
    expect(result).toHaveLength(2);
  });

  it('P0 regression: removes a descendant even when a sibling sits between it and its ancestor in DOM order', () => {
    // Build DOM order: <A> contains <C>, and <B> is a sibling inserted between them.
    //   body
    //    ├─ A (div)
    //    │   └─ C (span)
    //    └─ B (div)
    // Sorted by DOM position: [A, C, B] or [A, B, C] depending on tree walk; here we
    // pass them in an order that exposes the bug: ancestor first, sibling second,
    // descendant third.
    const a = document.createElement('div');
    const b = document.createElement('div');
    const c = document.createElement('span');
    a.appendChild(c);
    document.body.appendChild(a);
    document.body.appendChild(b);

    // Pass [A, B, C]: A contains C, B is a sibling.
    const result = deduplicateAncestors([a, b, c]);
    // Before the fix, only the LAST kept element (B) was compared, so C survived.
    // After the fix, C is recognized as a descendant of A and dropped.
    expect(result).toEqual([a, b]);
    expect(result).not.toContain(c);
  });
});
