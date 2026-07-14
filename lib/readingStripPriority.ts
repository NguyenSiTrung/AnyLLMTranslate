/**
 * Prefer top-of-fold + heading pieces when a large viewport flush arrives (FR-10).
 * Pure sort — content script supplies geometry + heading hints.
 */

export interface PriorityPieceInput {
  id: string;
  /** Distance from top of viewport (px); smaller = higher priority. */
  viewportTop: number;
  /** True when the piece is a heading-like element (H1–H6). */
  isHeading?: boolean;
  /** Stable fallback order (original index in the flush). */
  originalIndex: number;
}

/**
 * Sort pieces for translation order: headings first within the reading strip,
 * then top-to-bottom. Stable for equal keys via originalIndex.
 */
export function sortByReadingStripPriority<T extends PriorityPieceInput>(pieces: T[]): T[] {
  return [...pieces].sort((a, b) => {
    // Headings before body when both are in roughly the same band
    // (within 120px) so title text leads the first LLM batch.
    const bandA = Math.floor(a.viewportTop / 120);
    const bandB = Math.floor(b.viewportTop / 120);
    if (bandA !== bandB) return bandA - bandB;

    const headA = a.isHeading ? 0 : 1;
    const headB = b.isHeading ? 0 : 1;
    if (headA !== headB) return headA - headB;

    if (a.viewportTop !== b.viewportTop) return a.viewportTop - b.viewportTop;
    return a.originalIndex - b.originalIndex;
  });
}

/** Tag names treated as headings for priority. */
export const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

export function isHeadingElement(el: Element | null | undefined): boolean {
  if (!el) return false;
  return HEADING_TAGS.has(el.tagName);
}
