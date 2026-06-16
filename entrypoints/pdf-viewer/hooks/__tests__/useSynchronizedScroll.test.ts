/**
 * Tests for the `useSynchronizedScroll` hook.
 *
 * Verifies:
 * - A scroll on the left pane updates the right pane.
 * - A scroll on the right pane updates the left pane (bidirectional).
 * - When source/target have different scroll heights, the target's `scrollTop`
 *   is scaled proportionally so the *fraction* of content visible matches.
 * - Programmatic syncing uses `scrollTo({ behavior: 'instant' })`.
 * - The update guard prevents feedback loops.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { useSynchronizedScroll } from '../useSynchronizedScroll';

let leftEl: HTMLDivElement;
let rightEl: HTMLDivElement;

function setupElements(): void {
  // jsdom defaults clientHeight/scrollHeight to 0 — mock them manually.
  Object.defineProperty(leftEl, 'clientHeight', { configurable: true, value: 200 });
  Object.defineProperty(rightEl, 'clientHeight', { configurable: true, value: 200 });
  Object.defineProperty(leftEl, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(rightEl, 'scrollHeight', { configurable: true, value: 1000 });

  // jsdom doesn't implement scrollTo — mock it to update scrollTop
  leftEl.scrollTo = vi.fn(({ top }: ScrollToOptions) => {
    if (top !== undefined) leftEl.scrollTop = top;
  }) as unknown as typeof leftEl.scrollTo;
  rightEl.scrollTo = vi.fn(({ top }: ScrollToOptions) => {
    if (top !== undefined) rightEl.scrollTop = top;
  }) as unknown as typeof rightEl.scrollTo;
}

beforeEach(() => {
  document.body.innerHTML = '';
  leftEl = document.createElement('div');
  rightEl = document.createElement('div');
  document.body.appendChild(leftEl);
  document.body.appendChild(rightEl);
  setupElements();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useSynchronizedScroll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mirrors the left pane scroll to the right pane', () => {
    renderHook(() => {
      const leftRef = useRef<HTMLDivElement | null>(leftEl);
      const rightRef = useRef<HTMLDivElement | null>(rightEl);
      useSynchronizedScroll({ leftRef, rightRef });
    });

    act(() => {
      leftEl.scrollTop = 400;
      leftEl.dispatchEvent(new Event('scroll'));
    });
    // requestAnimationFrame is queued; flush it
    act(() => {
      vi.advanceTimersByTime(0);
    });
    // The right pane should mirror the left's scrollTop (heights are equal)
    expect(rightEl.scrollTop).toBe(400);
  });

  it('mirrors the right pane scroll to the left pane (bidirectional)', () => {
    renderHook(() => {
      const leftRef = useRef<HTMLDivElement | null>(leftEl);
      const rightRef = useRef<HTMLDivElement | null>(rightEl);
      useSynchronizedScroll({ leftRef, rightRef });
    });

    act(() => {
      rightEl.scrollTop = 300;
      rightEl.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    // Bidirectional: left should now be at 300
    expect(leftEl.scrollTop).toBe(300);
  });

  it('scales scrollTop proportionally when panes have different heights', () => {
    Object.defineProperty(leftEl, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(rightEl, 'scrollHeight', { configurable: true, value: 1000 });

    renderHook(() => {
      const leftRef = useRef<HTMLDivElement | null>(leftEl);
      const rightRef = useRef<HTMLDivElement | null>(rightEl);
      useSynchronizedScroll({ leftRef, rightRef });
    });

    act(() => {
      leftEl.scrollTop = 1000; // 1000/1800 = ~55.5%
      leftEl.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    // Target = (1000/1800) * 800 ≈ 444
    expect(rightEl.scrollTop).toBeGreaterThan(400);
    expect(rightEl.scrollTop).toBeLessThan(460);
  });

  it('uses scrollTo with behavior: instant for programmatic sync', () => {
    renderHook(() => {
      const leftRef = useRef<HTMLDivElement | null>(leftEl);
      const rightRef = useRef<HTMLDivElement | null>(rightEl);
      useSynchronizedScroll({ leftRef, rightRef });
    });

    act(() => {
      leftEl.scrollTop = 200;
      leftEl.dispatchEvent(new Event('scroll'));
    });

    // Verify scrollTo was called with behavior: 'instant'
    expect(rightEl.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'instant' }),
    );
  });

  it('does not cause feedback loops during bidirectional sync', () => {
    renderHook(() => {
      const leftRef = useRef<HTMLDivElement | null>(leftEl);
      const rightRef = useRef<HTMLDivElement | null>(rightEl);
      useSynchronizedScroll({ leftRef, rightRef });
    });

    // Scroll left → right should sync
    act(() => {
      leftEl.scrollTop = 400;
      leftEl.dispatchEvent(new Event('scroll'));
    });

    // During the same frame, if right's scroll event fires (from the programmatic
    // scrollTo), the guard should prevent it from scrolling left back to 0
    const leftScrollToMock = vi.mocked(leftEl.scrollTo);
    const callCountBefore = leftScrollToMock.mock.calls.length;

    act(() => {
      // Simulate right pane firing scroll event from the programmatic scrollTo
      rightEl.dispatchEvent(new Event('scroll'));
    });

    // The left pane's scrollTo should NOT have been called again (guard blocks it)
    expect(leftScrollToMock.mock.calls.length).toBe(callCountBefore);
  });
});

describe('useSynchronizedScroll page-block sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Append page block children to a container, mocking geometry so that
   *  `collectPageBlocks` resolves each block to its absolute content offset. */
  function appendPages(
    container: HTMLElement,
    pages: Array<{ number: number; top: number; height: number }>,
    attr: 'data-page-number' | 'data-page-slot',
  ): void {
    for (const p of pages) {
      const el = document.createElement('div');
      el.setAttribute(attr, String(p.number));
      container.appendChild(el);
      el.getBoundingClientRect = () =>
        ({
          top: p.top - container.scrollTop,
          height: p.height,
          bottom: p.top - container.scrollTop + p.height,
          left: 0,
          right: 0,
          width: 720,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect;
    }
    container.getBoundingClientRect = () =>
      ({
        top: 0,
        height: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 720,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }

  it('interpolates within the matching page when right pane is taller', () => {
    // Left: 2 pages, each 1000px tall. Right: 2 pages, each 2000px tall.
    appendPages(leftEl, [
      { number: 1, top: 0, height: 1000 },
      { number: 2, top: 1000, height: 1000 },
    ], 'data-page-number');
    appendPages(rightEl, [
      { number: 1, top: 0, height: 2000 },
      { number: 1, top: 2000, height: 2000 },
    ], 'data-page-slot');

    renderHook(() => {
      const leftRef = useRef<HTMLDivElement | null>(leftEl);
      const rightRef = useRef<HTMLDivElement | null>(rightEl);
      useSynchronizedScroll({ leftRef, rightRef });
    });

    // Scroll left to the middle of page 1 (500/1000 = 50%).
    act(() => {
      leftEl.scrollTop = 500;
      leftEl.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    // Right page 1 is 2000px → 50% = 1000px.
    expect(rightEl.scrollTop).toBe(1000);
  });

  it('aligns at page boundaries even when heights differ', () => {
    // Left: page boundaries at 0 and 1000. Right: page boundaries at 0 and 2000.
    appendPages(leftEl, [
      { number: 1, top: 0, height: 1000 },
      { number: 2, top: 1000, height: 1000 },
    ], 'data-page-number');
    appendPages(rightEl, [
      { number: 1, top: 0, height: 2000 },
      { number: 2, top: 2000, height: 2000 },
    ], 'data-page-slot');

    renderHook(() => {
      const leftRef = useRef<HTMLDivElement | null>(leftEl);
      const rightRef = useRef<HTMLDivElement | null>(rightEl);
      useSynchronizedScroll({ leftRef, rightRef });
    });

    // Scroll left to the start of page 2 → right should start page 2 (2000px).
    act(() => {
      leftEl.scrollTop = 1000;
      leftEl.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(rightEl.scrollTop).toBe(2000);
  });

  it('keeps panes in sync while scrolling deep into a later page', () => {
    // Left: 3 short pages (300px each). Right: 3 tall pages (900px each).
    appendPages(leftEl, [
      { number: 1, top: 0, height: 300 },
      { number: 2, top: 300, height: 300 },
      { number: 3, top: 600, height: 300 },
    ], 'data-page-number');
    appendPages(rightEl, [
      { number: 1, top: 0, height: 900 },
      { number: 2, top: 900, height: 900 },
      { number: 3, top: 1800, height: 900 },
    ], 'data-page-slot');

    renderHook(() => {
      const leftRef = useRef<HTMLDivElement | null>(leftEl);
      const rightRef = useRef<HTMLDivElement | null>(rightEl);
      useSynchronizedScroll({ leftRef, rightRef });
    });

    // Scroll left to 1/3 into page 3: page 3 starts at 600, height 300 → 750 = 50%.
    act(() => {
      leftEl.scrollTop = 750;
      leftEl.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    // Right page 3 starts at 1800, height 900 → 50% = 2250.
    expect(rightEl.scrollTop).toBe(2250);
  });
});
