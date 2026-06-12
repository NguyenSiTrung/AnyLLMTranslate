/**
 * Tests for the `useSynchronizedScroll` hook.
 *
 * Verifies:
 * - A scroll on the source pane updates the target's `scrollTop`.
 * - A scroll on the target pane does NOT trigger a feedback loop on the source
 *   (we guard via the `updateSourceRef` flag).
 * - When source/target have different scroll heights, the target's `scrollTop`
 *   is scaled proportionally so the *fraction* of content visible matches.
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

  it('does not feedback-loop when the right pane is programmatically scrolled', () => {
    renderHook(() => {
      const leftRef = useRef<HTMLDivElement | null>(leftEl);
      const rightRef = useRef<HTMLDivElement | null>(rightEl);
      useSynchronizedScroll({ leftRef, rightRef });
    });

    // Scroll only the right pane — left should NOT change
    act(() => {
      rightEl.scrollTop = 300;
      rightEl.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(leftEl.scrollTop).toBe(0);
  });
});
