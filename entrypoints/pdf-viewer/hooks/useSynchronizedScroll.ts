/**
 * useSynchronizedScroll — Mirror scroll offsets between two scrollable panes.
 *
 * Why a custom hook (instead of just `scrollTop = other.scrollTop` on each event)?
 * - We need an update-source guard so a programmatic scroll from mirroring does
 *   not retrigger the other pane's listener (which would otherwise cause
 *   feedback loops and jitter).
 * - We proportionally scale `scrollTop` when the two panes have different
 *   scroll heights, so the *visual* position lines up page-for-page.
 * - We use the same pattern in extension UI elsewhere (e.g. subtitle handlers),
 *   so this stays consistent with existing scroll-sync code.
 */

import { useEffect, useRef, type RefObject } from 'react';

export interface UseSynchronizedScrollOptions {
  /** Ref to the source pane's scroll container. */
  leftRef: RefObject<HTMLElement | null>;
  /** Ref to the target pane's scroll container. */
  rightRef: RefObject<HTMLElement | null>;
  /** Optional: which pane initiates sync. Defaults to `'left'`. */
  source?: 'left' | 'right';
}

/**
 * Calculate the scroll position that mirrors the source's progress through its
 * scrollable content. If both panes have the same scroll height the result is
 * identical to `source.scrollTop`; otherwise the target is interpolated so the
 * same *fraction* of content is shown in both panes.
 */
function mirrorScrollTop(source: HTMLElement, target: HTMLElement): number {
  const sourceMax = source.scrollHeight - source.clientHeight;
  const targetMax = target.scrollHeight - target.clientHeight;
  if (sourceMax <= 0 || targetMax <= 0) return source.scrollTop;
  return (source.scrollTop / sourceMax) * targetMax;
}

export function useSynchronizedScroll({
  leftRef,
  rightRef,
  source = 'left',
}: UseSynchronizedScrollOptions): void {
  // Tracks which element is currently being scrolled to, to avoid feedback loops
  const updateSourceRef = useRef<'left' | 'right' | null>(null);

  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;

    const syncFromLeft = (): void => {
      if (updateSourceRef.current === 'left') return;
      updateSourceRef.current = 'left';
      right.scrollTop = mirrorScrollTop(left, right);
      // Defer clearing the guard so the right-pane scroll event (if any) is ignored
      window.requestAnimationFrame(() => {
        updateSourceRef.current = null;
      });
    };

    const syncFromRight = (): void => {
      if (updateSourceRef.current === 'right') return;
      updateSourceRef.current = 'right';
      left.scrollTop = mirrorScrollTop(right, left);
      window.requestAnimationFrame(() => {
        updateSourceRef.current = null;
      });
    };

    const sourceElement = source === 'left' ? left : right;
    const handler = source === 'left' ? syncFromLeft : syncFromRight;
    sourceElement.addEventListener('scroll', handler, { passive: true });

    return () => {
      sourceElement.removeEventListener('scroll', handler);
    };
  }, [leftRef, rightRef, source]);
}
