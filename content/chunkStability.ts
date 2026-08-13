/**
 * Chunk stability helpers — keep the user's reading position stable while
 * translations are injected chunk by chunk.
 *
 * Problem: when a user starts translation mid-page, each chunk's spinner and
 * translation block changes page height. Browsers normally compensate via
 * native scroll anchoring, but many sites disable it (`overflow-anchor: none`)
 * and native anchoring is suppressed right after the user scrolls. Without
 * compensation the page visibly jumps as chunks render.
 *
 * Strategy: before injecting a batch, capture a stable "anchor" — the
 * bottom-most visible piece parent in the batch. After the batch is injected,
 * measure how far the anchor moved and scroll back by that delta so it stays
 * visually put. If the browser already compensated (native anchoring), the
 * delta is ~0 and we do nothing (no double compensation).
 */

export interface ScrollAnchor {
  element: Element;
  /** getBoundingClientRect().top at capture time. */
  initialTop: number;
  /** window.scrollY at capture time — compensation is skipped if the user scrolled since. */
  initialScrollY: number;
}

export interface AnchorOptions {
  viewportHeight?: number;
  /** Keep in sync with VIEWPORT_MARGIN (IntersectionObserver rootMargin). */
  viewportMarginPx?: number;
}

export interface ScrollAnchorPieceInput {
  parentElement: Element;
}

function windowScrollY(): number {
  return typeof window !== 'undefined' ? window.scrollY : 0;
}

function resolveViewportHeight(options: AnchorOptions): number {
  return options.viewportHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 800);
}

/**
 * Pick the bottom-most piece parent within (or near) the viewport as the
 * compensation anchor. Insertions above it move it by exactly the height we
 * must scroll to keep the user's view stable. Pieces below the fold + margin
 * (look-ahead prefetch) are excluded — nothing about them affects the view.
 */
export function pickScrollAnchor(
  pieces: readonly ScrollAnchorPieceInput[],
  options: AnchorOptions = {},
): Element | null {
  const viewportHeight = resolveViewportHeight(options);
  const margin = options.viewportMarginPx ?? 200;
  let best: Element | null = null;
  let bestTop = -Infinity;
  for (const piece of pieces) {
    const el = piece.parentElement;
    if (!el || !el.isConnected) continue;
    let top: number;
    try {
      top = el.getBoundingClientRect().top;
    } catch {
      continue; // detached node
    }
    if (top > viewportHeight + margin) continue;
    if (top > bestTop) {
      bestTop = top;
      best = el;
    }
  }
  return best;
}

/** Capture the scroll anchor for a batch before injecting its chunks. */
export function captureScrollAnchor(
  pieces: readonly ScrollAnchorPieceInput[],
  options: AnchorOptions = {},
): ScrollAnchor | null {
  const element = pickScrollAnchor(pieces, options);
  if (!element) return null;
  let initialTop: number;
  try {
    initialTop = element.getBoundingClientRect().top;
  } catch {
    return null;
  }
  return { element, initialTop, initialScrollY: windowScrollY() };
}

/**
 * True when the element still participates in layout. Used to skip
 * compensation when the anchor itself was hidden by a display-mode swap
 * (translation-only hides `[data-anyllm-role="original"]`), which would
 * corrupt the measured delta.
 */
function isLaidOut(el: Element): boolean {
  if (el === document.body || el === document.documentElement) return true;
  const htmlEl = el as HTMLElement;
  // display:none (and detached) elements have no offsetParent and no client
  // rects. position:fixed elements have a null offsetParent but still have
  // rects — keep those.
  return htmlEl.offsetParent !== null || htmlEl.getClientRects().length > 0;
}

/**
 * Re-align the viewport so the anchor element stays visually put after chunk
 * insertions. Runs on the next animation frame so native scroll anchoring has
 * already had its chance — if it compensated, the delta is ~0 and we do
 * nothing. Skips when the user scrolled during the frame or the anchor was
 * hidden (translation-only swap).
 */
export function restoreScrollAnchor(anchor: ScrollAnchor | null): void {
  if (!anchor) return;
  const compensate = (): void => {
    if (!anchor.element.isConnected) return;
    // The user scrolled while the batch was being applied — do not fight them.
    if (windowScrollY() !== anchor.initialScrollY) return;
    let top: number;
    try {
      top = anchor.element.getBoundingClientRect().top;
    } catch {
      return;
    }
    if (!isLaidOut(anchor.element)) return;
    const delta = top - anchor.initialTop;
    if (Math.abs(delta) < 0.5) return;
    window.scrollBy(0, delta);
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(compensate);
  } else {
    compensate();
  }
}

/**
 * Reorder background results into the request's piece order so chunks are
 * applied top-to-bottom (reading order) instead of LLM completion order.
 * Background sub-batches run with concurrency, so results arrive out of order;
 * applying them out of order makes the viewport fill in "holes" when the user
 * starts translation mid-page. Unknown ids sort last (defensive).
 */
export function orderResultsByPieces<T extends { id: string }>(
  results: readonly T[],
  pieces: readonly { id: string }[],
): T[] {
  const order = new Map(pieces.map((p, index) => [p.id, index]));
  return [...results].sort((a, b) => {
    const ia = order.get(a.id) ?? Number.POSITIVE_INFINITY;
    const ib = order.get(b.id) ?? Number.POSITIVE_INFINITY;
    return ia - ib;
  });
}

/**
 * Whether a piece's parent rect intersects the viewport + margin. Used by the
 * resume-snapshot restore: injecting cached translations for the WHOLE page
 * while the user is scrolled mid-page grows everything above the viewport and
 * jumps the scroll position. Only near-viewport pieces are restored; the rest
 * stay untranslated and are filled by the viewport observer (cache hit) when
 * the user scrolls there.
 */
export function isPieceNearViewport(
  piece: { parentElement: Element },
  options: AnchorOptions = {},
): boolean {
  const viewportHeight = resolveViewportHeight(options);
  const margin = options.viewportMarginPx ?? 200;
  let top: number;
  let bottom: number;
  try {
    const rect = piece.parentElement.getBoundingClientRect();
    top = rect.top;
    bottom = rect.bottom;
  } catch {
    return false;
  }
  return bottom >= -margin && top <= viewportHeight + margin;
}
