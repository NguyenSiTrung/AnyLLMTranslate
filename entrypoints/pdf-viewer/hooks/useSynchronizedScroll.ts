/**
 * useSynchronizedScroll — Bidirectional scroll sync between two scrollable panes.
 *
 * Uses a **page-block interpolation** algorithm so the two panes stay aligned at
 * page boundaries even when the translated (right) pane grows taller than the
 * original. The scroll position is mapped page-by-page: we find which page the
 * source is currently viewing, compute the progress *within that page*, and
 * apply the same progress to the matching page block in the target pane.
 *
 * When page blocks cannot be detected (e.g. in unit tests with plain divs, or
 * before pages render), it falls back to ratio-based mirroring.
 *
 * Uses an update-source guard + requestAnimationFrame to prevent feedback loops
 * when one pane's programmatic scroll triggers the other's listener, and
 * `scrollTo({ behavior: 'instant' })` to ignore CSS `scroll-behavior: smooth`.
 */

import { useEffect, useRef } from 'react';

export interface UseSynchronizedScrollOptions {
  /** The left pane's scroll container element (or null when unmounted). */
  leftEl: HTMLElement | null;
  /** The right pane's scroll container element (or null when unmounted). */
  rightEl: HTMLElement | null;
}

interface PageBlock {
  /** 1-indexed page number. */
  pageNumber: number;
  /** Offset of the block's top edge within the scrollable content (px). */
  top: number;
  /** Block height (px). */
  height: number;
}

/**
 * Collect page block geometry from a scroll container. Blocks are identified by
 * the `data-page-number` (left pane) or `data-page-slot` (right pane) attribute.
 * Returns blocks sorted by document order with their absolute content offset.
 */
function collectPageBlocks(container: HTMLElement): PageBlock[] {
  const containerRect = container.getBoundingClientRect();
  const elements = Array.from(
    container.querySelectorAll<HTMLElement>('[data-page-number], [data-page-slot]'),
  );
  const blocks: PageBlock[] = [];
  for (const el of elements) {
    const raw = el.dataset.pageNumber ?? el.dataset.pageSlot;
    const pageNumber = Number(raw);
    if (!Number.isFinite(pageNumber) || pageNumber <= 0) continue;
    const rect = el.getBoundingClientRect();
    blocks.push({
      pageNumber,
      top: rect.top - containerRect.top + container.scrollTop,
      height: rect.height,
    });
  }
  return blocks;
}

/**
 * Find the page block that contains `scrollTop`, or the last block whose top is
 * at or before it. Returns the block and the index into `blocks`.
 */
function findActiveBlock(
  scrollTop: number,
  blocks: PageBlock[],
): { block: PageBlock; index: number } | null {
  if (blocks.length === 0) return null;
  let active = blocks[0];
  let activeIndex = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (scrollTop >= blocks[i].top) {
      active = blocks[i];
      activeIndex = i;
    } else {
      break;
    }
  }
  return { block: active, index: activeIndex };
}

/**
 * Map a source scroll position onto the target using page-block interpolation.
 * Aligns the two panes at page boundaries and interpolates within the matching
 * page, so taller translated pages stay in sync page-by-page.
 *
 * Falls back to ratio-based mirroring when page blocks are unavailable.
 */
export function mirrorScrollTop(source: HTMLElement, target: HTMLElement): number {
  const sourceBlocks = collectPageBlocks(source);
  const targetBlocks = collectPageBlocks(target);

  if (sourceBlocks.length > 0 && targetBlocks.length > 0) {
    const active = findActiveBlock(source.scrollTop, sourceBlocks);
    if (active) {
      // Progress within the active source page block (0..1).
      const progress =
        active.block.height > 0
          ? Math.min(1, Math.max(0, (source.scrollTop - active.block.top) / active.block.height))
          : 0;
      // Find the matching target block by page number, then by position.
      const tgtBlock =
        targetBlocks.find((b) => b.pageNumber === active.block.pageNumber) ??
        targetBlocks[Math.min(active.index, targetBlocks.length - 1)];
      return tgtBlock.top + progress * tgtBlock.height;
    }
  }

  // Fallback: ratio-based mirroring across the whole scrollable range.
  if (source.scrollHeight === target.scrollHeight) {
    return source.scrollTop;
  }
  const sourceMax = source.scrollHeight - source.clientHeight;
  const targetMax = target.scrollHeight - target.clientHeight;
  if (sourceMax <= 0 || targetMax <= 0) return source.scrollTop;
  return (source.scrollTop / sourceMax) * targetMax;
}

export function useSynchronizedScroll({
  leftEl,
  rightEl,
}: UseSynchronizedScrollOptions): void {
  // Tracks which element is currently being programmatically scrolled,
  // preventing feedback loops where pane A scrolls pane B which re-scrolls A.
  const isUpdatingRef = useRef(false);

  useEffect(() => {
    if (!leftEl || !rightEl) return;

    const syncFromLeft = (): void => {
      if (isUpdatingRef.current) return;
      isUpdatingRef.current = true;
      rightEl.scrollTo({ top: mirrorScrollTop(leftEl, rightEl), behavior: 'instant' });
      requestAnimationFrame(() => {
        isUpdatingRef.current = false;
      });
    };

    const syncFromRight = (): void => {
      if (isUpdatingRef.current) return;
      isUpdatingRef.current = true;
      leftEl.scrollTo({ top: mirrorScrollTop(rightEl, leftEl), behavior: 'instant' });
      requestAnimationFrame(() => {
        isUpdatingRef.current = false;
      });
    };

    // Bidirectional: both panes listen for scroll events
    leftEl.addEventListener('scroll', syncFromLeft, { passive: true });
    rightEl.addEventListener('scroll', syncFromRight, { passive: true });

    return () => {
      leftEl.removeEventListener('scroll', syncFromLeft);
      rightEl.removeEventListener('scroll', syncFromRight);
      // Reset the guard so a torn-down effect (e.g. pane unmount mid-sync)
      // never leaves it stuck true, which would silence all future syncing.
      isUpdatingRef.current = false;
    };
  }, [leftEl, rightEl]);
}
