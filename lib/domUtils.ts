/**
 * Shared DOM utility functions.
 */

/**
 * Deduplicate elements by keeping only the outermost ones.
 * Removes any element that is a descendant of another element in the list.
 * Uses a sort-based O(n log n) approach instead of the naive O(n²) .contains() check.
 */
export function deduplicateAncestors(elements: Element[]): Element[] {
  if (elements.length <= 1) return elements;

  // Sort by DOM order using compareDocumentPosition
  const sorted = [...elements].sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  const result: Element[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    // P0: check against EVERY kept ancestor, not just the last one. The previous
    // `result[result.length - 1].contains(el)` check missed descendants of an
    // earlier-kept element when a sibling appeared between them in DOM order:
    // sorted [A, B, C] with A⊇C but B a sibling kept C incorrectly because it
    // only compared against B (the last pushed).
    if (!result.some((r) => r.contains(sorted[i]))) {
      result.push(sorted[i]);
    }
  }

  return result;
}
