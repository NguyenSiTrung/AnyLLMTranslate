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
    it('orders results into piece reading order, trails unknown ids, and does not mutate inputs', () => {
      const pieces = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const results = [
        { id: 'c', translatedText: 'C' },
        { id: 'a', translatedText: 'A' },
        { id: 'b', translatedText: 'B' },
      ];
      expect(orderResultsByPieces(results, pieces).map((r) => r.id)).toEqual(['a', 'b', 'c']);

      const unknownResults = [
        { id: 'zzz', translatedText: 'Z' },
        { id: 'a', translatedText: 'A' },
      ];
      const ordered = orderResultsByPieces(unknownResults, [{ id: 'a' }, { id: 'b' }]);
      expect(ordered.map((r) => r.id)).toEqual(['a', 'zzz']);
      expect(unknownResults.map((r) => r.id)).toEqual(['zzz', 'a']);
    });
  });

  describe('pickScrollAnchor', () => {
    it('picks the bottom-most piece in the viewport band, excludes below-fold + margin pieces, and returns null for below-fold or detached pieces', () => {
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

      stubRect(belowFold, { top: 1500 });
      expect(
        pickScrollAnchor([{ parentElement: belowFold }], { viewportHeight: 800 }),
      ).toBeNull();

      const detached = document.createElement('p'); // never appended
      expect(pickScrollAnchor([{ parentElement: detached }], { viewportHeight: 800 })).toBeNull();
    });
  });


  describe('captureScrollAnchor / restoreScrollAnchor', () => {
    it('captures anchor top + scrollY, compensates insertions, and skips ~0 delta, user scroll, hidden anchors, null anchors, and look-ahead-only batches', () => {
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
      vi.mocked(window.scrollBy).mockClear();

      // Top unchanged → native anchoring already compensated.
      stubRect(p, { top: 300 });
      restoreScrollAnchor(anchor);
      expect(window.scrollBy).not.toHaveBeenCalled();
      vi.mocked(window.scrollBy).mockClear();

      // User scrolled during application → skip.
      Object.defineProperty(window, 'scrollY', { value: 620, configurable: true, writable: true });
      stubRect(p, { top: 380 });
      restoreScrollAnchor(anchor);
      expect(window.scrollBy).not.toHaveBeenCalled();
      vi.mocked(window.scrollBy).mockClear();
      Object.defineProperty(window, 'scrollY', { value: 500, configurable: true, writable: true });

      // Anchor hidden by translation-only (display:none → no offsetParent, no rects) → skip.
      Object.defineProperty(p, 'offsetParent', { value: null, configurable: true });
      vi.spyOn(p, 'getClientRects').mockReturnValue([] as unknown as DOMRectList);
      stubRect(p, { top: 0 });
      restoreScrollAnchor(anchor);
      expect(window.scrollBy).not.toHaveBeenCalled();
      vi.mocked(window.scrollBy).mockClear();

      // Null anchors and look-ahead-only batches are no-ops.
      restoreScrollAnchor(null);
      expect(window.scrollBy).not.toHaveBeenCalled();

      const belowFold = document.createElement('p');
      document.body.appendChild(belowFold);
      stubRect(belowFold, { top: 1500 });
      const nullAnchor = captureScrollAnchor([{ parentElement: belowFold }], {
        viewportHeight: 800,
      });
      expect(nullAnchor).toBeNull();
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
