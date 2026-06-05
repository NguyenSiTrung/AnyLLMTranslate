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
    const last = result[result.length - 1];
    // In DOM order, if last.contains(sorted[i]), skip sorted[i]
    if (!last.contains(sorted[i])) {
      result.push(sorted[i]);
    }
  }

  return result;
}
