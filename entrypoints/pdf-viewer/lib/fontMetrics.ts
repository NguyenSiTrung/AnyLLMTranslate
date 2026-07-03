/**
 * fontMetrics — Canvas-based font metrics for accurate text geometry.
 *
 * Used by the PDF Layout overlay to pre-compute the rendered height of a
 * translated box BEFORE paint. This avoids the layout-thrash pattern of
 * render-then-getBoundingClientRect-then-reflow: the box is placed at the
 * correct position on first paint, eliminating collision flashes.
 *
 * Strategy:
 * - Use a Canvas 2D context (`measureText`) to get exact per-word widths,
 *   accounting for the actual font's glyph metrics (kerning, wide chars,
 *   CJK, etc.).
 * - Wrap words into lines greedily respecting the available width.
 * - Height = lines × (fontSize × lineHeightFactor) + vertical padding.
 *
 * A measurement cache keyed by `(fontFamily, fontSize, word)` avoids
 * re-measuring the same word across boxes — typical PDFs repeat words
 * ("the", "of", "and") thousands of times.
 *
 * Graceful fallback: when `getContext('2d')` returns null (e.g. jsdom,
 * headless environments without canvas support), measurements fall back to
 * a conservative `fontSize × 0.5` per-character average — never throws.
 */

/** Font configuration used for all measurements in this call. */
export interface FontMetricsOpts {
  fontFamily: string;
  fontSize: number;
}

/** Result of measuring a text box's geometry. */
export interface BoxMetrics {
  /** Number of wrapped lines the text occupies. */
  lines: number;
  /** Total rendered height (px) including line height + padding. */
  height: number;
}

/** Line height multiplier (matches CSS `line-height: 1.45` on layout boxes). */
const LINE_HEIGHT_FACTOR = 1.45;
/** Vertical padding (px) reserved for box borders/descenders. */
const BOX_PADDING_PX = 2;
/** Horizontal padding (px) subtracted from the box width for wrapping. */
const BOX_HPAD_PX = 6;
/** Fallback avg char width as a fraction of font size (no canvas available). */
const FALLBACK_CHAR_WIDTH_FACTOR = 0.5;
/** Approx width of a space character as a fraction of font size. */
const SPACE_WIDTH_FACTOR = 0.28;

/**
 * Cache: `${fontFamily}\u0000${fontSize}\u0000${word}` → measured width (px).
 * Module-level so it persists across calls within the same viewer session.
 */
const wordWidthCache = new Map<string, number>();

/** Lazily-created offscreen canvas + context for `measureText`. */
let offscreenCanvas: HTMLCanvasElement | null = null;
let offscreenCtx: CanvasRenderingContext2D | null = null;

/** Current font string set on the context (to detect when we must update it). */
let currentCtxFont: string | null = null;

/**
 * Get (or lazily create) the offscreen 2D context used for measuring text.
 * Returns `null` when the environment has no canvas support (jsdom, etc.) —
 * callers must fall back to a heuristic in that case.
 *
 * Also returns `null` when the context exists but lacks `measureText` (e.g.
 * a test stub that returns `{}`). We require a functional `measureText` to
 * produce trustworthy widths; otherwise the heuristic is safer.
 */
function getMeasureCtx(opts: FontMetricsOpts): CanvasRenderingContext2D | null {
  if (!offscreenCanvas) {
    try {
      offscreenCanvas = document.createElement('canvas');
    } catch {
      return null;
    }
  }
  let ctx = offscreenCtx;
  if (!ctx) {
    const candidate = offscreenCanvas.getContext('2d');
    if (!candidate || typeof candidate.measureText !== 'function') return null;
    ctx = candidate;
    offscreenCtx = ctx;
  }
  const fontStr = `${opts.fontSize}px ${opts.fontFamily}`;
  if (currentCtxFont !== fontStr) {
    ctx.font = fontStr;
    currentCtxFont = fontStr;
  }
  return ctx;
}

/** Build the cache key for a word under a given font configuration. */
function cacheKey(opts: FontMetricsOpts, word: string): string {
  return `${opts.fontFamily}\u0000${opts.fontSize}\u0000${word}`;
}

/**
 * Measure a single word's rendered width (px), using the canvas context.
 * Results are cached per `(fontFamily, fontSize, word)` — repeated words
 * across a document are measured exactly once.
 *
 * Falls back to `fontSize × 0.5 × chars` when no canvas is available.
 */
export function measureWord(word: string, opts: FontMetricsOpts): number {
  const key = cacheKey(opts, word);
  const cached = wordWidthCache.get(key);
  if (cached !== undefined) return cached;

  const ctx = getMeasureCtx(opts);
  let width: number;
  if (ctx) {
    width = ctx.measureText(word).width;
  } else {
    // Heuristic fallback: proportional to text length and font size.
    width = word.length * opts.fontSize * FALLBACK_CHAR_WIDTH_FACTOR;
  }
  wordWidthCache.set(key, width);
  return width;
}

/** Approximate width of a single space character (px). */
function measureSpaceWidth(opts: FontMetricsOpts): number {
  const ctx = getMeasureCtx(opts);
  if (ctx) return ctx.measureText(' ').width;
  return opts.fontSize * SPACE_WIDTH_FACTOR;
}

/**
 * Greedily wrap text into lines that each fit within `maxWidthPx`.
 *
 * - Words are split on whitespace (multiple spaces collapsed).
 * - A word longer than the line is char-broken so it never overflows.
 * - Empty/whitespace-only text returns a single empty line.
 */
export function wrapTextIntoLines(text: string, maxWidthPx: number, opts: FontMetricsOpts): string[] {
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [''];

  const effectiveWidth = Math.max(maxWidthPx - BOX_HPAD_PX, 1);
  const spaceWidth = measureSpaceWidth(opts);
  const lines: string[] = [];
  let current = '';
  let currentWidth = 0;

  for (const word of words) {
    const wordWidth = measureWord(word, opts);

    // Word fits on the current line (with a separating space if non-empty).
    if (current === '') {
      if (wordWidth <= effectiveWidth) {
        current = word;
        currentWidth = wordWidth;
        continue;
      }
      // Word longer than a whole line → char-break it.
      for (const piece of charBreak(word, effectiveWidth, opts)) {
        lines.push(piece);
      }
      current = '';
      currentWidth = 0;
      continue;
    }

    if (currentWidth + spaceWidth + wordWidth <= effectiveWidth) {
      current += ' ' + word;
      currentWidth += spaceWidth + wordWidth;
    } else {
      lines.push(current);
      if (wordWidth <= effectiveWidth) {
        current = word;
        currentWidth = wordWidth;
      } else {
        for (const piece of charBreak(word, effectiveWidth, opts)) {
          lines.push(piece);
        }
        current = '';
        currentWidth = 0;
      }
    }
  }
  if (current !== '' || lines.length === 0) lines.push(current);
  return lines;
}

/**
 * Break a single over-long word into chunks that each fit `maxWidthPx`.
 * Char-by-char accumulation is the simplest robust approach for CJK / long
 * tokens without dictionary hyphenation.
 */
function charBreak(word: string, maxWidthPx: number, opts: FontMetricsOpts): string[] {
  const chunks: string[] = [];
  let current = '';
  let currentWidth = 0;
  for (const ch of word) {
    const chWidth = measureWord(ch, opts);
    if (current === '' || currentWidth + chWidth <= maxWidthPx) {
      current += ch;
      currentWidth += chWidth;
    } else {
      chunks.push(current);
      current = ch;
      currentWidth = chWidth;
    }
  }
  if (current !== '') chunks.push(current);
  return chunks.length > 0 ? chunks : [word];
}

/**
 * Measure the rendered geometry (line count + height) of a text box at a
 * given width and font configuration. Pure: reads no DOM, mutates only the
 * cache.
 */
export function measureBoxHeight(
  text: string,
  widthPx: number,
  opts: FontMetricsOpts,
): BoxMetrics {
  const lines = wrapTextIntoLines(text, widthPx, opts);
  const lineCount = Math.max(1, lines.length);
  const height = lineCount * opts.fontSize * LINE_HEIGHT_FACTOR + BOX_PADDING_PX;
  return { lines: lineCount, height };
}

/**
 * Clear the entire word-width cache AND reset the cached canvas context.
 *
 * The word cache is the hot-path optimization (persist across calls); the
 * context reset is needed when the rendering environment changes (e.g. tests
 * swapping `getContext` mocks, or an explicit "re-measure after font load").
 */
export function clearFontMetricsCache(): void {
  wordWidthCache.clear();
  offscreenCanvas = null;
  offscreenCtx = null;
  currentCtxFont = null;
}
