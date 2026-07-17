/**
 * pdfTypesetting — BabelDOC-inspired typesetting ladder for PDF prose boxes.
 *
 * Inspired by BabelDOC public design (fit → compact line spacing → scale font
 * → expand into free space → hard min with overflow flag). Methodology only;
 * no AGPL source was copied.
 *
 * Used by Layout overlay and translated PDF download so both share the same
 * fit behavior for prose paragraphs.
 */

/** Axis-aligned paragraph box (same coordinate units as the caller). */
export interface TypesettingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Optional free space adjacent to the original box that may be claimed when
 * text does not fit at a readable scale.
 */
export interface FreeSpace {
  /** Extra width available to the right of the box. */
  right?: number;
  /** Extra height available below the box (top-edge / CSS-like coords). */
  down?: number;
}

/** Pluggable text measurement (canvas, pdf-lib font, or pure heuristic). */
export interface FontMetricsHook {
  measure(opts: {
    text: string;
    fontSize: number;
    /** Line-height multiplier (e.g. 1.45). */
    lineHeight: number;
    width: number;
  }): { lines: string[]; height: number };
}

/** Result of the typesetting ladder. */
export interface TypesettingResult {
  fontSize: number;
  /** Line-height multiplier used for the fit. */
  lineHeight: number;
  /** Possibly expanded box. */
  box: TypesettingBox;
  lines: string[];
  /** True when text still does not fit at hard min scale. */
  overflow: boolean;
}

export interface FitTextToBoxOptions {
  box: TypesettingBox;
  text: string;
  naturalFontSize: number;
  metrics: FontMetricsHook;
  freeSpace?: FreeSpace;
  /** Soft floor for scale before aggressive expand (~0.6). Default 0.6. */
  softMinScale?: number;
  /** Hard minimum scale; at/below with still overflow → overflow:true. Default 0.1. */
  hardMinScale?: number;
  /** Natural line-height multiplier. Default 1.45. */
  naturalLineHeight?: number;
  /** Minimum line-height multiplier when compacting. Default 1.05. */
  minLineHeight?: number;
}

const DEFAULT_SOFT_MIN_SCALE = 0.6;
const DEFAULT_HARD_MIN_SCALE = 0.1;
const DEFAULT_NATURAL_LINE_HEIGHT = 1.45;
const DEFAULT_MIN_LINE_HEIGHT = 1.05;
/** Step when reducing line-height. */
const LINE_HEIGHT_STEP = 0.05;
/** Scale decrement while above soft min. */
const SCALE_STEP_FINE = 0.05;
/** Scale decrement at/below soft min. */
const SCALE_STEP_COARSE = 0.1;

function cloneBox(box: TypesettingBox): TypesettingBox {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function tryMeasure(
  metrics: FontMetricsHook,
  text: string,
  fontSize: number,
  lineHeight: number,
  box: TypesettingBox,
): { lines: string[]; height: number; fits: boolean } {
  const measured = metrics.measure({
    text,
    fontSize,
    lineHeight,
    width: Math.max(box.width, 1),
  });
  return {
    lines: measured.lines,
    height: measured.height,
    fits: measured.height <= box.height + 1e-6,
  };
}

/**
 * Fit translated text into a paragraph box using a BabelDOC-inspired ladder:
 * 1. Natural size + natural line height
 * 2. Reduce line spacing within bounds
 * 3. Scale font down toward soft min
 * 4. Expand box into free horizontal/vertical space when available
 * 5. Continue scaling to hard min; set overflow if still too tall
 */
export function fitTextToBox(options: FitTextToBoxOptions): TypesettingResult {
  const {
    text,
    naturalFontSize,
    metrics,
    freeSpace,
    softMinScale = DEFAULT_SOFT_MIN_SCALE,
    hardMinScale = DEFAULT_HARD_MIN_SCALE,
    naturalLineHeight = DEFAULT_NATURAL_LINE_HEIGHT,
    minLineHeight = DEFAULT_MIN_LINE_HEIGHT,
  } = options;

  const naturalFs = Math.max(naturalFontSize, 1e-6);
  let box = cloneBox(options.box);

  // Empty / whitespace: natural fit, no work.
  if (!text.trim()) {
    return {
      fontSize: naturalFs,
      lineHeight: naturalLineHeight,
      box,
      lines: [''],
      overflow: false,
    };
  }

  // --- Step 1: natural fit ---
  {
    const m = tryMeasure(metrics, text, naturalFs, naturalLineHeight, box);
    if (m.fits) {
      return {
        fontSize: naturalFs,
        lineHeight: naturalLineHeight,
        box,
        lines: m.lines,
        overflow: false,
      };
    }
  }

  // --- Step 2: reduce line spacing at natural font size ---
  let bestLineHeight = naturalLineHeight;
  for (
    let lh = naturalLineHeight - LINE_HEIGHT_STEP;
    lh >= minLineHeight - 1e-9;
    lh -= LINE_HEIGHT_STEP
  ) {
    const clampedLh = Math.max(lh, minLineHeight);
    const m = tryMeasure(metrics, text, naturalFs, clampedLh, box);
    bestLineHeight = clampedLh;
    if (m.fits) {
      return {
        fontSize: naturalFs,
        lineHeight: clampedLh,
        box,
        lines: m.lines,
        overflow: false,
      };
    }
  }

  // Use compacted line height for subsequent scale/expand steps.
  const compactLh = Math.max(bestLineHeight, minLineHeight);

  // --- Step 3: scale font down toward soft min ---
  let scale = 1.0 - SCALE_STEP_FINE;
  while (scale > softMinScale + 1e-9) {
    const fs = naturalFs * scale;
    const m = tryMeasure(metrics, text, fs, compactLh, box);
    if (m.fits) {
      return {
        fontSize: fs,
        lineHeight: compactLh,
        box,
        lines: m.lines,
        overflow: false,
      };
    }
    scale -= SCALE_STEP_FINE;
  }

  // --- Step 4: expand into free space (right, then down), then continue scale ---
  let expanded = false;
  const right = freeSpace?.right ?? 0;
  if (right > 0) {
    box = { ...box, width: box.width + right };
    expanded = true;
    // Re-try from natural after expand (wider box often allows natural size).
    {
      const m = tryMeasure(metrics, text, naturalFs, compactLh, box);
      if (m.fits) {
        return {
          fontSize: naturalFs,
          lineHeight: compactLh,
          box,
          lines: m.lines,
          overflow: false,
        };
      }
    }
    scale = 1.0;
    while (scale >= softMinScale - 1e-9) {
      const fs = naturalFs * scale;
      const m = tryMeasure(metrics, text, fs, compactLh, box);
      if (m.fits) {
        return {
          fontSize: fs,
          lineHeight: compactLh,
          box,
          lines: m.lines,
          overflow: false,
        };
      }
      scale -= SCALE_STEP_FINE;
    }
  }

  const down = freeSpace?.down ?? 0;
  if (down > 0) {
    box = { ...box, height: box.height + down };
    expanded = true;
    {
      const m = tryMeasure(metrics, text, naturalFs, compactLh, box);
      if (m.fits) {
        return {
          fontSize: naturalFs,
          lineHeight: compactLh,
          box,
          lines: m.lines,
          overflow: false,
        };
      }
    }
    scale = 1.0;
    while (scale >= softMinScale - 1e-9) {
      const fs = naturalFs * scale;
      const m = tryMeasure(metrics, text, fs, compactLh, box);
      if (m.fits) {
        return {
          fontSize: fs,
          lineHeight: compactLh,
          box,
          lines: m.lines,
          overflow: false,
        };
      }
      scale -= SCALE_STEP_FINE;
    }
  }

  // Silence unused if expand path never ran — still continue to hard min.
  void expanded;

  // --- Step 5: continue scaling from soft min down to hard min ---
  scale = softMinScale;
  let lastLines: string[] = [text];
  let lastFs = naturalFs * hardMinScale;
  while (scale >= hardMinScale - 1e-9) {
    const fs = naturalFs * scale;
    const m = tryMeasure(metrics, text, fs, compactLh, box);
    lastLines = m.lines;
    lastFs = fs;
    if (m.fits) {
      return {
        fontSize: fs,
        lineHeight: compactLh,
        box,
        lines: m.lines,
        overflow: false,
      };
    }
    scale -= scale > softMinScale ? SCALE_STEP_FINE : SCALE_STEP_COARSE;
  }

  // Floor: hard min scale with overflow flag.
  const floorFs = naturalFs * hardMinScale;
  const floor = tryMeasure(metrics, text, floorFs, compactLh, box);
  return {
    fontSize: floorFs,
    lineHeight: compactLh,
    box,
    lines: floor.lines.length > 0 ? floor.lines : lastLines,
    overflow: !floor.fits,
  };
}
