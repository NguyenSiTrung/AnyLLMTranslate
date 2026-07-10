import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ViewportObserver } from '../viewportObserver';
import type { TranslationPiece } from '@/types/translation';

function makePiece(id: string, parent: Element, text = 'hello'): TranslationPiece {
  return {
    id,
    parentElement: parent,
    textNodes: [],
    text,
    isTranslated: false,
  };
}

/**
 * jsdom does not implement IntersectionObserver. Provide a minimal mock that
 * records observes and lets tests fire intersections manually.
 */
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observed = new Set<Element>();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.add(el);
  }

  unobserve(el: Element): void {
    this.observed.delete(el);
  }

  disconnect(): void {
    this.observed.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  fire(el: Element, isIntersecting: boolean): void {
    this.callback(
      [
        {
          target: el,
          isIntersecting,
          // unused fields
          boundingClientRect: el.getBoundingClientRect(),
          intersectionRatio: isIntersecting ? 1 : 0,
          intersectionRect: el.getBoundingClientRect(),
          rootBounds: null,
          time: Date.now(),
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
}

describe('ViewportObserver', () => {
  let originalIO: typeof IntersectionObserver;

  beforeEach(() => {
    document.body.innerHTML = '';
    MockIntersectionObserver.instances = [];
    originalIO = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.IntersectionObserver = originalIO;
    vi.useRealTimers();
  });

  it('dispatches untranslated pieces once when they enter the viewport', () => {
    const onVisible = vi.fn();
    const observer = new ViewportObserver(onVisible, 50);
    const p = document.createElement('p');
    document.body.appendChild(p);
    const piece = makePiece('a', p);
    observer.observe(piece);

    const mock = MockIntersectionObserver.instances[0];
    mock.fire(p, true);
    vi.advanceTimersByTime(50);

    expect(onVisible).toHaveBeenCalledTimes(1);
    expect(onVisible.mock.calls[0][0]).toEqual([piece]);
    // Unobserved after dispatch
    expect(mock.observed.has(p)).toBe(false);
    observer.disconnect();
  });

  it('does not re-dispatch the same piece id after release is needed', () => {
    const onVisible = vi.fn();
    const observer = new ViewportObserver(onVisible, 50);
    const p = document.createElement('p');
    document.body.appendChild(p);
    const piece = makePiece('a', p);
    observer.observe(piece);

    const mock = MockIntersectionObserver.instances[0];
    mock.fire(p, true);
    vi.advanceTimersByTime(50);
    expect(onVisible).toHaveBeenCalledTimes(1);

    // Re-observe without release — should be a no-op (already dispatched)
    observer.observe(piece);
    expect(mock.observed.has(p)).toBe(false);

    // After release, can observe and dispatch again
    observer.release('a');
    observer.observe(piece);
    mock.fire(p, true);
    vi.advanceTimersByTime(50);
    expect(onVisible).toHaveBeenCalledTimes(2);
    observer.disconnect();
  });

  it('dedupes pending piece ids within the same batch window', () => {
    const onVisible = vi.fn();
    const observer = new ViewportObserver(onVisible, 50);
    const p1 = document.createElement('p');
    const p2 = document.createElement('p');
    document.body.appendChild(p1);
    document.body.appendChild(p2);
    const shared: TranslationPiece = makePiece('shared', p1);
    // Same piece object observed under two parents is unrealistic; simulate
    // pending accumulation of the same id by observing one piece and pushing
    // via two intersection targets that share the piece list... Instead:
    // observe two pieces with the same id (shouldn't happen) — filter by id.
    const a = makePiece('x', p1);
    const aDup = makePiece('x', p2);
    observer.observe(a);
    // Force both into pending by direct map manipulation is hard; fire both
    // after observing separately with release between... simpler: two fires
    // of same target shouldn't happen after unobserve.

    const mock = MockIntersectionObserver.instances[0];
    // Manually put dups into pending by observing a and firing, then
    // releasing and re-observing aDup with same id before flush.
    observer.observe(a);
    mock.fire(p1, true);
    // Before flush, release and re-queue same id via aDup
    observer.release('x');
    observer.observe(aDup);
    mock.fire(p2, true);
    vi.advanceTimersByTime(50);

    expect(onVisible).toHaveBeenCalledTimes(1);
    const batch = onVisible.mock.calls[0][0] as TranslationPiece[];
    expect(batch).toHaveLength(1);
    expect(batch[0].id).toBe('x');
    observer.disconnect();
  });

  it('when paused, does not dispatch intersecting pieces', () => {
    const onVisible = vi.fn();
    const observer = new ViewportObserver(onVisible, 50);
    const p = document.createElement('p');
    document.body.appendChild(p);
    const piece = makePiece('a', p);
    observer.observe(piece);
    observer.setPaused(true);

    const mock = MockIntersectionObserver.instances[0];
    mock.fire(p, true);
    vi.advanceTimersByTime(50);

    expect(onVisible).not.toHaveBeenCalled();
    // Still tracked
    expect(mock.observed.has(p)).toBe(true);
    observer.disconnect();
  });

  it('on unpause, redispatches currently visible tracked pieces', () => {
    const onVisible = vi.fn();
    const observer = new ViewportObserver(onVisible, 50);
    const p = document.createElement('p');
    // jsdom getBoundingClientRect defaults to all zeros — treat as visible
    // with our margin check (bottom >= -200 && top <= height+200).
    document.body.appendChild(p);
    const piece = makePiece('a', p);
    observer.observe(piece);
    observer.setPaused(true);

    const mock = MockIntersectionObserver.instances[0];
    mock.fire(p, true);
    vi.advanceTimersByTime(50);
    expect(onVisible).not.toHaveBeenCalled();

    observer.setPaused(false);
    vi.advanceTimersByTime(50);

    expect(onVisible).toHaveBeenCalledTimes(1);
    expect(onVisible.mock.calls[0][0][0].id).toBe('a');
    observer.disconnect();
  });
});
