/**
 * PDF composition helpers — BabelDOC-inspired formula placeholders.
 *
 * Mixed prose + formula paragraphs become strings like:
 *   "The loss is {v0} where the rate is …"
 *
 * Only the placeholder-bearing prose string is sent to the LLM. After
 * translation, `{vN}` tokens are reinserted with the original formula runs.
 * Invented placeholders (`{v9}` not in the map) are stripped.
 *
 * Stable token format: `{vN}` where N is a zero-based integer.
 *
 * License: reimplemented methodology; no AGPL source copy.
 */

import type { PdfParagraph, PdfTextRun } from './pdfTextExtraction';
import {
  classifyRuns,
  type ContentKind,
  type MathDetectOptions,
  type RunKind,
} from './pdfContentDetect';

/** Axis-aligned rect in PDF space (y = top edge, matching PdfParagraph.y). */
export interface MaskRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute white-mask rectangles for Layout overlay / download.
 *
 * - `math` / `figure` / verbatim: returns `null` (do not mask).
 * - Mixed runs: only **prose** run boxes (formula runs stay unmasked).
 * - Pure prose or no runs: single full-paragraph rect (legacy).
 */
export function getProseMaskRects(
  para: PdfParagraph,
  kind: ContentKind | undefined,
  translatedText: string,
  options?: MathDetectOptions,
): MaskRect[] | null {
  if (kind === 'math' || kind === 'figure') return null;
  if (translatedText.trim() === para.text.trim()) return null;

  const runs = para.runs;
  if (runs && runs.length > 0) {
    const runKinds = classifyRuns(runs, options);
    const proseRuns = runs.filter((_, i) => runKinds[i] === 'prose' && runs[i].text.trim());
    const formulaRuns = runs.filter((_, i) => runKinds[i] === 'formula');
    if (proseRuns.length === 0) return null;
    if (formulaRuns.length > 0) {
      // Selective mask: each prose run box. Run.y is baseline (≈ bottom);
      // convert to top-edge y = baseline + height for consistency with para.y.
      return proseRuns.map((r) => ({
        x: r.x,
        y: r.y + r.height,
        width: Math.max(r.width, 1),
        height: Math.max(r.height, 1),
      }));
    }
  }

  return [
    {
      x: para.x,
      y: para.y,
      width: para.width,
      height: para.height,
    },
  ];
}

/** Stable placeholder token: `{v0}`, `{v1}`, … */
export function placeholderToken(index: number): string {
  return `{v${index}}`;
}

/** Match any `{vN}` token in LLM output (including hallucinated indices). */
const PLACEHOLDER_RE = /\{v(\d+)\}/g;

export interface FormulaPlaceholder {
  /** Zero-based index N in `{vN}`. */
  index: number;
  /** Token string `{vN}`. */
  token: string;
  /** Concatenated original formula text for this slot. */
  text: string;
  /** Original runs that form this formula composition. */
  runs: PdfTextRun[];
}

/** Ordered segment after reassembly (for selective mask / Text mode debug). */
export interface CompositionSegment {
  kind: 'prose' | 'formula';
  text: string;
  /** Present for formula segments — geometry for overlay/download. */
  runs?: PdfTextRun[];
}

export interface TranslatePayload {
  /**
   * Text to send to the LLM (prose with `{vN}` placeholders), or original
   * text when there are no formula runs.
   */
  text: string;
  /** Formula slots replaced by placeholders (empty when none). */
  placeholders: FormulaPlaceholder[];
  /** True when the whole paragraph is formula — do not call the LLM. */
  formulaOnly: boolean;
  /** True when `text` contains at least one `{vN}`. */
  hasPlaceholders: boolean;
}

/**
 * Build an LLM-safe translate payload from a paragraph.
 * Consecutive formula runs collapse into a single `{vN}` slot.
 */
export function buildTranslatePayload(
  paragraph: PdfParagraph,
  options?: MathDetectOptions,
): TranslatePayload {
  const runs = paragraph.runs;
  if (!runs || runs.length === 0) {
    return {
      text: paragraph.text,
      placeholders: [],
      formulaOnly: false,
      hasPlaceholders: false,
    };
  }

  const kinds = classifyRuns(runs, options);
  const allFormula = kinds.every((k) => k === 'formula');
  const anyFormula = kinds.some((k) => k === 'formula');

  if (!anyFormula) {
    return {
      text: paragraph.text,
      placeholders: [],
      formulaOnly: false,
      hasPlaceholders: false,
    };
  }

  if (allFormula) {
    return {
      text: paragraph.text,
      placeholders: [],
      formulaOnly: true,
      hasPlaceholders: false,
    };
  }

  const placeholders: FormulaPlaceholder[] = [];
  const parts: string[] = [];
  let i = 0;

  while (i < runs.length) {
    const kind = kinds[i] as RunKind;
    if (kind === 'prose') {
      parts.push(runs[i].text);
      i += 1;
      continue;
    }
    // Collapse consecutive formula runs into one placeholder.
    const formulaRuns: PdfTextRun[] = [];
    while (i < runs.length && kinds[i] === 'formula') {
      formulaRuns.push(runs[i]);
      i += 1;
    }
    const index = placeholders.length;
    const token = placeholderToken(index);
    const text = formulaRuns.map((r) => r.text).join('');
    placeholders.push({ index, token, text, runs: formulaRuns });
    parts.push(token);
  }

  // Prefer run-joined payload; fall back to paragraph.text only if empty.
  const text = parts.join('').replace(/\s+/g, ' ').trim() || paragraph.text;

  return {
    text,
    placeholders,
    formulaOnly: false,
    hasPlaceholders: placeholders.length > 0,
  };
}

/**
 * Strip hallucinated `{vN}` tokens that are not in the known placeholder map.
 * Known tokens are left intact for reassembly.
 */
export function stripHallucinatedPlaceholders(
  translated: string,
  placeholders: FormulaPlaceholder[],
): string {
  if (!translated) return translated;
  const known = new Set(placeholders.map((p) => p.index));
  return translated.replace(PLACEHOLDER_RE, (match, num: string) => {
    const idx = Number(num);
    return known.has(idx) ? match : '';
  });
}

/**
 * Reinsert original formula text at known `{vN}` positions and build
 * composition segments for selective masking / debug display.
 */
export function reassembleTranslation(
  translated: string,
  placeholders: FormulaPlaceholder[],
): { displayText: string; compositions: CompositionSegment[] } {
  if (placeholders.length === 0) {
    return {
      displayText: translated,
      compositions: translated ? [{ kind: 'prose', text: translated }] : [],
    };
  }

  const byIndex = new Map(placeholders.map((p) => [p.index, p]));
  const cleaned = stripHallucinatedPlaceholders(translated, placeholders);
  const compositions: CompositionSegment[] = [];
  let displayText = '';
  let lastIndex = 0;

  const re = /\{v(\d+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(cleaned)) !== null) {
    const before = cleaned.slice(lastIndex, match.index);
    if (before.length > 0) {
      compositions.push({ kind: 'prose', text: before });
      displayText += before;
    }
    const idx = Number(match[1]);
    const ph = byIndex.get(idx);
    if (ph) {
      compositions.push({ kind: 'formula', text: ph.text, runs: ph.runs });
      displayText += ph.text;
    }
    lastIndex = match.index + match[0].length;
  }

  const tail = cleaned.slice(lastIndex);
  if (tail.length > 0) {
    compositions.push({ kind: 'prose', text: tail });
    displayText += tail;
  }

  // If the model dropped every placeholder, append original formulas so
  // content is never lost (fail-open identity for formula slots).
  if (placeholders.length > 0 && !placeholders.some((p) => cleaned.includes(p.token))) {
    for (const ph of placeholders) {
      if (!displayText.includes(ph.text)) {
        const sep = displayText && !displayText.endsWith(' ') ? ' ' : '';
        displayText += sep + ph.text;
        compositions.push({ kind: 'formula', text: ph.text, runs: ph.runs });
      }
    }
  }

  return { displayText, compositions };
}
