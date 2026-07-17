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
  classifyMathParagraph,
  classifyMathParagraphFromParagraph,
  classifyRuns,
  hasUnsafeOverlayGlyphs,
  looksLikeDisplayEquation,
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
 * - Failsafe: pure-math text (even without `kind`) never masked so the
 *   original canvas formula stays visible (avoids tofu/□ overlay glyphs).
 */
/**
 * True when Layout/download must leave the original canvas alone for this
 * paragraph (no white mask, no text overlay). Covers explicit kinds, rule
 * math, display-equation heuristics, and tofu-laden translations of math.
 */
export function shouldSkipLayoutOverlay(
  para: PdfParagraph,
  kind: ContentKind | undefined,
  translatedText: string,
  options?: MathDetectOptions,
): boolean {
  if (kind === 'math' || kind === 'figure') return true;
  if (translatedText.trim() === para.text.trim()) return true;
  if (classifyMathParagraphFromParagraph(para, options) === 'math') return true;
  if (classifyMathParagraph(translatedText, options) === 'math') return true;
  if (looksLikeDisplayEquation(para.text)) return true;
  // Translation is unrenderable garbage over a math-ish original → keep canvas.
  if (
    hasUnsafeOverlayGlyphs(translatedText) &&
    (looksLikeDisplayEquation(para.text) ||
      classifyMathParagraphFromParagraph(para, options) === 'math' ||
      paragraphHasFormulaRuns(para, options))
  ) {
    return true;
  }
  // Entire translation is tofu soup — never cover the page with □ boxes.
  if (hasUnsafeOverlayGlyphs(translatedText)) {
    const stripped = stripUnsafeOverlayGlyphs(translatedText);
    if (stripped.length < 8) return true;
  }
  return false;
}

export function getProseMaskRects(
  para: PdfParagraph,
  kind: ContentKind | undefined,
  translatedText: string,
  options?: MathDetectOptions,
): MaskRect[] | null {
  if (shouldSkipLayoutOverlay(para, kind, translatedText, options)) return null;

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

/** Strip tofu / private-use glyphs that cannot be painted by extension fonts. */
export function stripUnsafeOverlayGlyphs(text: string): string {
  return text
    .replace(/[\uFFFD□■▫▪\uE000-\uF8FF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Layout overlay must paint **prose only** when a mixed paragraph has formula
 * compositions or formula runs. Reassembled formula characters are PDF math
 * glyphs that the extension web font cannot render (□ tofu) and would cover
 * the unmasked original canvas formula.
 *
 * Returns empty string when there is no prose to show (caller should skip the
 * overlay box entirely).
 */
export function proseOnlyOverlayText(
  translatedText: string,
  compositions?: Array<{ kind: 'prose' | 'formula'; text: string }> | null,
  para?: PdfParagraph,
  options?: MathDetectOptions,
): string {
  if (compositions && compositions.length > 0) {
    const hasFormula = compositions.some((c) => c.kind === 'formula');
    if (hasFormula) {
      return compositions
        .filter((c) => c.kind === 'prose')
        .map((c) => c.text)
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  // No compositions (e.g. cache hit): strip original formula-run substrings
  // and unsafe glyphs so we never paint PDF math soup over the canvas.
  let text = translatedText;
  if (para?.runs && para.runs.length > 0) {
    const kinds = classifyRuns(para.runs, options);
    const formulaTexts = para.runs
      .filter((_, i) => kinds[i] === 'formula')
      .map((r) => r.text.trim())
      .filter((t) => t.length >= 1)
      // Longer first so we don't partially wipe shorter nested fragments.
      .sort((a, b) => b.length - a.length);
    for (const ft of formulaTexts) {
      if (text.includes(ft)) {
        text = text.split(ft).join(' ');
      }
    }
  }

  text = stripUnsafeOverlayGlyphs(text);
  return text.replace(/\s+/g, ' ').trim();
}

/** True when paragraph has at least one classified formula run. */
export function paragraphHasFormulaRuns(
  para: PdfParagraph,
  options?: MathDetectOptions,
): boolean {
  const runs = para.runs;
  if (!runs || runs.length === 0) return false;
  return classifyRuns(runs, options).some((k) => k === 'formula');
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

/** Ordered segment after reassembly (for selective mask geometry). */
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
