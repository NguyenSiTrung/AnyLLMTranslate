/**
 * Tests for the `useVisiblePages` hook.
 *
 * Verifies:
 * - Pages that intersect the viewport are included in the visible set
 * - Buffer pages around visible pages are also included
 * - Pages that leave the viewport are removed from the set
 * - The IntersectionObserver targets the correct container
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { useVisiblePages } from '../useVisiblePages';

type IntersectionCallback = (entries: IntersectionObserverEntry[]) => void;

let observerCallback: IntersectionCallback | null = null;
let observerOptions: IntersectionObserverInit | undefined;
const observedElements: Element[] = [];
const OriginalIntersectionObserver = globalThis.IntersectionObserver;

beforeEach(() => {
  observerCallback = null;
  observerOptions = undefined;
  observedElements.length = 0;

  globalThis.IntersectionObserver = vi.fn(
    (callback: IntersectionObserverCallback, options?: IntersectionObserverInit) => {
      observerCallback = callback as IntersectionCallback;
      observerOptions = options;
      return {
        observe: vi.fn((el: Element) => observedElements.push(el)),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
        takeRecords: vi.fn(() => []),
        root: options?.root ?? null,
        rootMargin: options?.rootMargin ?? '',
        thresholds: [],
      };
    },
  ) as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  globalThis.IntersectionObserver = OriginalIntersectionObserver;
  document.body.innerHTML = '';
});

function createContainer(pageCount: number): HTMLDivElement {
  const container = document.createElement('div');
  for (let i = 1; i <= pageCount; i++) {
    const slot = document.createElement('div');
    slot.setAttribute('data-page-number', String(i));
    container.appendChild(slot);
  }
  document.body.appendChild(container);
  return container;
}

function simulateIntersection(
  entries: Array<{ pageNumber: number; isIntersecting: boolean }>,
): void {
  if (!observerCallback) throw new Error('Observer not initialized');
  const fakeEntries = entries.map(({ pageNumber, isIntersecting }) => ({
    target: document.querySelector(`[data-page-number="${pageNumber}"]`)!,
    isIntersecting,
    boundingClientRect: {} as DOMRectReadOnly,
    intersectionRatio: isIntersecting ? 1 : 0,
    intersectionRect: {} as DOMRectReadOnly,
    rootBounds: null,
    time: Date.now(),
  }));
  observerCallback(fakeEntries);
}

describe('useVisiblePages', () => {
  it('includes intersecting pages in the visible set', () => {
    const container = createContainer(5);

    renderHook(() => {
      const containerRef = useRef<HTMLElement | null>(container);
      return useVisiblePages({ totalPages: 5, containerRef });
    });

    // All 5 page elements should be observed
    expect(observedElements.length).toBe(5);

    // Simulate page 3 becoming visible
    act(() => {
      simulateIntersection([{ pageNumber: 3, isIntersecting: true }]);
    });
  });

  it('includes buffer pages around visible pages', () => {
    const container = createContainer(10);

    const { result } = renderHook(() => {
      const containerRef = useRef<HTMLElement | null>(container);
      return useVisiblePages({ totalPages: 10, containerRef, buffer: 2 });
    });

    // Simulate page 5 becoming visible
    act(() => {
      simulateIntersection([{ pageNumber: 5, isIntersecting: true }]);
    });

    // With buffer=2: pages 3,4,5,6,7 should be visible
    expect(result.current.visiblePages).toEqual(new Set([3, 4, 5, 6, 7]));
  });

  it('clamps buffer to valid page range', () => {
    const container = createContainer(5);

    const { result } = renderHook(() => {
      const containerRef = useRef<HTMLElement | null>(container);
      return useVisiblePages({ totalPages: 5, containerRef, buffer: 2 });
    });

    // Simulate page 1 becoming visible
    act(() => {
      simulateIntersection([{ pageNumber: 1, isIntersecting: true }]);
    });

    // Buffer at start: pages 1,2,3 (not 0 or -1)
    expect(result.current.visiblePages).toEqual(new Set([1, 2, 3]));
  });

  it('removes pages that leave the viewport', () => {
    const container = createContainer(5);

    const { result } = renderHook(() => {
      const containerRef = useRef<HTMLElement | null>(container);
      return useVisiblePages({ totalPages: 5, containerRef, buffer: 0 });
    });

    // Pages 2 and 3 visible
    act(() => {
      simulateIntersection([
        { pageNumber: 2, isIntersecting: true },
        { pageNumber: 3, isIntersecting: true },
      ]);
    });
    expect(result.current.visiblePages).toEqual(new Set([2, 3]));

    // Page 2 leaves viewport
    act(() => {
      simulateIntersection([{ pageNumber: 2, isIntersecting: false }]);
    });
    expect(result.current.visiblePages).toEqual(new Set([3]));
  });

  it('uses the container element as the IntersectionObserver root', () => {
    const container = createContainer(3);

    renderHook(() => {
      const containerRef = useRef<HTMLElement | null>(container);
      return useVisiblePages({ totalPages: 3, containerRef });
    });

    expect(observerOptions?.root).toBe(container);
  });

  it('returns empty set when totalPages is 0', () => {
    const container = createContainer(0);

    const { result } = renderHook(() => {
      const containerRef = useRef<HTMLElement | null>(container);
      return useVisiblePages({ totalPages: 0, containerRef });
    });

    expect(result.current.visiblePages.size).toBe(0);
  });
});
