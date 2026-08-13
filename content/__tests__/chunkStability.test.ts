import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  captureScrollAnchor,
  isPieceNearViewport,
  orderResultsByPieces,
  pickScrollAnchor,
  restoreScrollAnchor,
} from '../chunkStability';

/** Stub getBoundingClientRect on an element. */
function stubRect(el: Element, rect: Partial<DOMRect>): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect);
}

/** Make an element "laid out" (real browsers set offsetParent; jsdom does not). */
function stubLaidOut(el: Element): void {
  Object.defineProperty(el, 'offsetParent', {
    value: document.body,
    configurable: true,
  });
}

describe('chunkStability', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.stubGlobal('scrollBy', vi.fn());
    // Synchronous rAF keeps these tests deterministic.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('orderResultsByPieces', () => {
    it('reorders results into piece order (reading order, not completion order)', () => {
      const pieces = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const results = [
        { id: 'c', translatedText: 'C' },
        { id: 'a', translatedText: 'A' },
        { id: 'b', translatedText: 'B' },
      ];
      expect(orderResultsByPieces(results, pieces).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    });

    it('places unknown ids last and does not mutate inputs', () => {
      const pieces = [{ id: 'a' }, { id: 'b' }];
      const results = [
        { id: 'zzz', translatedText: 'Z' },
        { id: 'a', translatedText: 'A' },
      ];
      const ordered = orderResultsByPieces(results, pieces);
      expect(ordered.map((r) => r.id)).toEqual(['a', 'zzz']);
      expect(results.map((r) => r.id)).toEqual(['zzz', 'a']);
    });
  });

  describe('pickScrollAnchor', () => {
    it('picks the bottom-most piece parent within the viewport band', () => {
      const above = document.createElement('p');
      const mid = document.createElement('p');
      const bottom = document.createElement('p');
      for (const el of [above, mid, bottom]) document.body.appendChild(el);
      stubRect(above, { top: 100 });
      stubRect(mid, { top: 400 });
      stubRect(bottom, { top: 700 });

      expect(
        pickScrollAnchor(
          [{ parentElement: above }, { parentElement: mid }, { parentElement: bottom }],
          { viewportHeight: 800 },
        ),
      ).toBe(bottom);
    });

    it('excludes pieces below the fold + margin (look-ahead prefetch)', () => {
      const visible = document.createElement('p');
      const belowFold = document.createElement('p');
      document.body.appendChild(visible);
      document.body.appendChild(belowFold);
      stubRect(visible, { top: 600 });
      stubRect(belowFold, { top: 1100 }); // 800 + 200 margin = 1000 cutoff

      expect(
        pickScrollAnchor([{ parentElement: visible }, { parentElement: belowFold }], {
          viewportHeight: 800,
          viewportMarginPx: 200,
        }),
      ).toBe(visible);
    });

    it('returns null when all pieces are below the fold or disconnected', () => {
      const belowFold = document.createElement('p');
      document.body.appendChild(belowFold);
      stubRect(belowFold, { top: 1500 });
      expect(pickScrollAnchor([{ parentElement: belowFold }], { viewportHeight: 800 })).toBeNull();

      const detached = document.createElement('p'); // never appended
      expect(pickScrollAnchor([{ parentElement: detached }], { viewportHeight: 800 })).toBeNull();
    });
  });


  describe('captureScrollAnchor / restoreScrollAnchor', () => {
    it('captures the anchor top + scrollY and compensates after insertions', () => {
      const p = document.createElement('p');
      document.body.appendChild(p);
      stubRect(p, { top: 300 });
      stubLaidOut(p);

      const anchor = captureScrollAnchor([{ parentElement: p }], { viewportHeight: 800 });
      expect(anchor).not.toBeNull();
      expect(anchor?.initialTop).toBe(300);
      expect(anchor?.initialScrollY).toBe(500);

      // Chunks above the anchor were inserted → anchor moved down 45px.
      stubRect(p, { top: 345 });
      restoreScrollAnchor(anchor);
      expect(window.scrollBy).toHaveBeenCalledWith(0, 45);
    });

    it('does nothing when the delta is ~0 (native anchoring already compensated)', () => {
      const p = document.createElement('p');
      document.body.appendChild(p);
      stubRect(p, { top: 300 });
      stubLaidOut(p);

      const anchor = captureScrollAnchor([{ parentElement: p }], { viewportHeight: 800 });
      restoreScrollAnchor(anchor); // top unchanged
      expect(window.scrollBy).not.toHaveBeenCalled();
    });

    it('skips when the user scrolled during application', () => {
      const p = document.createElement('p');
      document.body.appendChild(p);
      stubRect(p, { top: 300 });
      stubLaidOut(p);

      const anchor = captureScrollAnchor([{ parentElement: p }], { viewportHeight: 800 });
      Object.defineProperty(window, 'scrollY', { value: 620, configurable: true, writable: true });
      stubRect(p, { top: 380 });
      restoreScrollAnchor(anchor);
      expect(window.scrollBy).not.toHaveBeenCalled();
    });

    it('skips when the anchor was hidden (translation-only display swap)', () => {
      const p = document.createElement('p');
      document.body.appendChild(p);
      stubRect(p, { top: 300 });
      // Laid out at capture…
      stubLaidOut(p);
      const anchor = captureScrollAnchor([{ parentElement: p }], { viewportHeight: 800 });
      // …then hidden by translation-only (display:none → no offsetParent, no rects).
      Object.defineProperty(p, 'offsetParent', { value: null, configurable: true });
      vi.spyOn(p, 'getClientRects').mockReturnValue([] as unknown as DOMRectList);
      stubRect(p, { top: 0 });
      restoreScrollAnchor(anchor);
      expect(window.scrollBy).not.toHaveBeenCalled();
    });

    it('is a no-op for null anchors and look-ahead-only batches', () => {
      restoreScrollAnchor(null);
      expect(window.scrollBy).not.toHaveBeenCalled();

      const belowFold = document.createElement('p');
      document.body.appendChild(belowFold);
      stubRect(belowFold, { top: 1500 });
      const anchor = captureScrollAnchor([{ parentElement: belowFold }], { viewportHeight: 800 });
      expect(anchor).toBeNull();
    });
  });

  describe('isPieceNearViewport', () => {
    it('is true inside the viewport + margin and false far outside', () => {
      const inside = document.createElement('p');
      const above = document.createElement('p');
      const below = document.createElement('p');
      document.body.appendChild(inside);
      document.body.appendChild(above);
      document.body.appendChild(below);
      stubRect(inside, { top: 400, bottom: 420 });
      stubRect(above, { top: -500, bottom: -480 });
      stubRect(below, { top: 1200, bottom: 1220 });

      expect(isPieceNearViewport({ parentElement: inside }, { viewportHeight: 800 })).toBe(true);
      expect(isPieceNearViewport({ parentElement: above }, { viewportHeight: 800 })).toBe(false);
      expect(isPieceNearViewport({ parentElement: below }, { viewportHeight: 800 })).toBe(false);
    });
  });
});
