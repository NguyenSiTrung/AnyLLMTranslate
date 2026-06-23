/**
 * useVisiblePages — Tracks which PDF pages are visible in the viewport.
 *
 * Uses IntersectionObserver on lightweight placeholder elements in the left
 * pane to determine which pages should render their canvas. Pages outside the
 * visible window (+buffer) can be unmounted to free GPU/memory resources.
 *
 * Why a separate hook?
 * - The existing `usePdfPageTranslations` uses its own IntersectionObserver
 *   for the right pane's translation slots. Canvas virtualization requires
 *   observing the left pane's page placeholders independently.
 * - This keeps the canvas lifecycle decoupled from translation lifecycle.
 */

import { useEffect, useRef, useState } from 'react';

export interface UseVisiblePagesOptions {
  /** Total number of pages in the document. */
  totalPages: number;
  /** Reference to the scrollable container. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Number of pages to pre-render above and below the viewport. Defaults to 2. */
  buffer?: number;
  /** IntersectionObserver root margin. Defaults to '200px 0px'. */
  rootMargin?: string;
}

export interface UseVisiblePagesResult {
  /** Set of 1-indexed page numbers that should render their canvas. */
  visiblePages: Set<number>;
}

export function useVisiblePages({
  totalPages,
  containerRef,
  buffer = 2,
  rootMargin = '200px 0px',
}: UseVisiblePagesOptions): UseVisiblePagesResult {
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set());
  const observedPagesRef = useRef<Set<number>>(new Set());
  const [container, setContainer] = useState<HTMLElement | null>(null);

  // Sync the ref's current element into state so the observer effect can
  // depend on the resolved element rather than the mutable ref's .current
  // property (which React does not track in dependency arrays).
  useEffect(() => {
    if (containerRef.current !== container) {
      setContainer(containerRef.current);
    }
  });

  useEffect(() => {
    if (totalPages === 0) return;
    if (!container) return;

    const slots: Element[] = Array.from(
      container.querySelectorAll('[data-page-number]'),
    );
    if (slots.length === 0) return;

    // Track which pages are currently intersecting
    observedPagesRef.current = new Set();

    const observer = new IntersectionObserver(
      (entries) => {
        const current = new Set(observedPagesRef.current);
        for (const entry of entries) {
          const pageNumber = Number(
            entry.target.getAttribute('data-page-number'),
          );
          if (!Number.isFinite(pageNumber)) continue;

          if (entry.isIntersecting) {
            current.add(pageNumber);
          } else {
            current.delete(pageNumber);
          }
        }

        observedPagesRef.current = current;

        // Expand with buffer pages
        const withBuffer = new Set<number>();
        for (const page of current) {
          for (
            let i = Math.max(1, page - buffer);
            i <= Math.min(totalPages, page + buffer);
            i++
          ) {
            withBuffer.add(i);
          }
        }

        setVisiblePages(withBuffer);
      },
      { root: container, rootMargin, threshold: 0 },
    );

    for (const slot of slots) {
      observer.observe(slot);
    }

    return () => {
      observer.disconnect();
    };
  }, [totalPages, container, buffer, rootMargin]);

  return { visiblePages };
}
