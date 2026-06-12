/**
 * useSynchronizedScroll — Bidirectional scroll sync between two scrollable panes.
 *
 * Mirrors scroll offsets proportionally so both panes show the same fraction of
 * their content. Uses an update-source guard + requestAnimationFrame to prevent
 * feedback loops when one pane's programmatic scroll triggers the other's listener.
 *
 * Uses `scrollTo({ behavior: 'instant' })` for programmatic sync to avoid
 * interference from CSS `scroll-behavior: smooth`.
 */

import { useEffect, useRef, type RefObject } from 'react';

export interface UseSynchronizedScrollOptions {
  /** Ref to the left pane's scroll container. */
  leftRef: RefObject<HTMLElement | null>;
  /** Ref to the right pane's scroll container. */
  rightRef: RefObject<HTMLElement | null>;
}

/**
 * Calculate the scroll position that mirrors the source's progress through its
 * scrollable content. If both panes have the same scroll height the result is
 * identical to `source.scrollTop`; otherwise the target is interpolated so the
 * same *fraction* of content is shown in both panes.
 */
function mirrorScrollTop(source: HTMLElement, target: HTMLElement): number {
  if (source.scrollHeight === target.scrollHeight) {
    return source.scrollTop;
  }
  const sourceMax = source.scrollHeight - source.clientHeight;
  const targetMax = target.scrollHeight - target.clientHeight;
  if (sourceMax <= 0 || targetMax <= 0) return source.scrollTop;
  return (source.scrollTop / sourceMax) * targetMax;
}

export function useSynchronizedScroll({
  leftRef,
  rightRef,
}: UseSynchronizedScrollOptions): void {
  // Tracks which element is currently being programmatically scrolled,
  // preventing feedback loops where pane A scrolls pane B which re-scrolls pane A.
  const isUpdatingRef = useRef(false);

  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;

    const syncFromLeft = (): void => {
      if (isUpdatingRef.current) return;
      isUpdatingRef.current = true;
      right.scrollTo({ top: mirrorScrollTop(left, right), behavior: 'instant' });
      requestAnimationFrame(() => {
        isUpdatingRef.current = false;
      });
    };

    const syncFromRight = (): void => {
      if (isUpdatingRef.current) return;
      isUpdatingRef.current = true;
      left.scrollTo({ top: mirrorScrollTop(right, left), behavior: 'instant' });
      requestAnimationFrame(() => {
        isUpdatingRef.current = false;
      });
    };

    // Bidirectional: both panes listen for scroll events
    left.addEventListener('scroll', syncFromLeft, { passive: true });
    right.addEventListener('scroll', syncFromRight, { passive: true });

    return () => {
      left.removeEventListener('scroll', syncFromLeft);
      right.removeEventListener('scroll', syncFromRight);
    };
  }, [leftRef, rightRef]);
}
