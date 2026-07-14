/**
 * Pure, synchronous content detection for PDF paragraphs.
 *
 * Used by `translateParagraphs()` to decide which paragraphs to skip
 * translation for:
 * - **Math** — rule-based on text alone (`classifyMathParagraph`)
 * - **Table/figure cells** — rule-based spatial + numeric heuristics
 *   (`classifyTableLikeParagraphs`); remaining ambiguous labels still go
 *   through the LLM classifier in `pdfTranslation.ts`
 *
 * Why pure/synchronous? It is deterministic, free (no API call), trivially
 * unit-testable, and immune to network failure. The math rules are
 * conservative: a paragraph is only flagged `'math'` when it is clearly
 * dominated by mathematical content. Mixed prose-with-inline-math stays
 * `'prose'` and relies on the translation prompt to preserve the inline math.
 */

import type { PdfParagraph } from './pdfTextExtraction';

/** Result of classifying a paragraph's content kind (math path). */
export type ParagraphKind = 'prose' | 'math';

/** Full content kind used end-to-end in the PDF pipeline. */
export type ContentKind = 'prose' | 'math' | 'figure';

/**
 * Tunable: maximum number of whitespace-separated words a paragraph may have
 * to be eligible for the "short math fragment" paths (inline-only LaTeX,
 * strong math marker).
 */
const SHORT_MATH_MAX_WORDS = 12;

/**
 * Tunable: longer formulas (PDF-extracted multi-term equations) may use the
 * density path up to this word count.
 */
const DENSITY_MATH_MAX_WORDS = 40;

/** Minimum math-symbol density for the longer-formula path. */
const DENSITY_MATH_MIN_RATIO = 0.18;

/**
 * Tunable: for standalone inline LaTeX (`\(…\)` / `$…$`), the paragraph is
 * flagged when the delimited content is at least this many characters AND the
 * text outside the delimiters is ≤ this many words.
 */
const INLINE_LATEX_MIN_INNER_CHARS = 4;
const INLINE_LATEX_MAX_OUTSIDE_WORDS = 8;

/**
 * Block-level LaTeX delimiters. A single match flags the paragraph as math
 * regardless of length — these unambiguously denote a display equation.
 */
const LATEX_BLOCK_PATTERNS: RegExp[] = [
  /\\\[[\s\S]*?\\\]/, // \[ ... \]
  /\$\$[\s\S]*?\$\$/, // $$ ... $$
  // Match \begin{env}...\end{env} for math environments. The env name in
  // \end{...} should mirror \begin{...}, but strict backreference matching is
  // unnecessary for our detection (presence of a math environment is enough),
  // and avoids a non-capturing-group backreference that TS flags as malformed.
  /\\begin\{(?:equation|align|gather|cases|matrix|bmatrix|pmatrix)\*?\}[\s\S]*?\\end\{(?:equation|align|gather|cases|matrix|bmatrix|pmatrix)\*?\}/,
];

/**
 * Standalone inline LaTeX: `\(…\)` or `$…$`. Flagged only when the inner
 * content is substantial AND the surrounding text is short.
 */
const INLINE_LATEX_PATTERN = /\\\(([^)]{4,})\\\)|\$([^$\n]{4,})\$/;

/** Count whitespace-separated words. */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Strip inline/block LaTeX delimiters and their inner content, returning the
 * "outside" prose (used to test whether the paragraph is prose-with-a-symbol
 * vs. a standalone formula).
 */
function stripLatexBlocks(text: string): string {
  return text
    .replace(/\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\\begin\{(?:equation|align|gather|cases|matrix|bmatrix|pmatrix)\*?\}[\s\S]*?\\end\{(?:equation|align|gather|cases|matrix|bmatrix|pmatrix)\*?\}/g, ' ')
    .replace(/\\\([^)]*\\\)/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Decisive math markers — characters whose presence in a short string is a
 * reliable signal that the string is a mathematical expression rather than
 * prose. These are deliberately *not* ambiguous ASCII punctuation: `+ - / *`
 * and `< >` are excluded because they appear in ordinary prose and prices.
 *
 * Includes relational operators, big operators (∑ ∏ ∫), arrows, quantifiers,
 * and Greek letters (α-ω, Α-Ω). Note: Greek is safe to treat as a math marker
 * here because the source language is English; a Greek letter in a short
 * English fragment is almost always a math variable.
 */
const STRONG_MATH_MARKERS = new Set(
  (
    '=≠≈∼≅≺≻≤≥⊂⊃⊆⊇∈∉∪∩∑∏∫∮∂∇√∞∀∃¬⊥⊕⊗⊙∝±∓∅' +
    '→←↔↦⇒⇔⌊⌋⌈⌉' +
    'αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ'
  ).split(''),
);

/**
 * Unicode codepoint ranges for superscript/subscript characters used in
 * mathematical notation (e.g. x², aᵢ, xₙ). These count as math markers
 * because they essentially never appear outside formulas.
 *
 * - U+00B9, U+00B2, U+00B3: ¹ ² ³
 * - U+2070–U+209F: Superscripts and Subscripts (⁰ⁱⁿ⁰₉₊₋ etc.)
 * - U+1D2C–U+1DAF: Phonetic Extensions + Supplement (modifier letters incl.
 *   ᵢ ᵣ ᵤ ᵥ and superscript letters like ᵃ ᵇ).
 */
function isSuperSubscriptCode(code: number): boolean {
  return (
    code === 0x00b9 ||
    code === 0x00b2 ||
    code === 0x00b3 ||
    (code >= 0x2070 && code <= 0x209f) ||
    (code >= 0x1d2c && code <= 0x1daf)
  );
}

/**
 * Mathematical Alphanumeric Symbols block (U+1D400–U+1D7FF) — italic/bold
 * variables common in PDF-extracted research papers.
 */
function isMathAlphanumericCode(code: number): boolean {
  return code >= 0x1d400 && code <= 0x1d7ff;
}

/**
 * Does the string contain at least one decisive math marker (strong symbol,
 * Unicode super/subscript, or math alphanumeric)?
 */
function hasStrongMathMarker(text: string): boolean {
  for (const ch of text) {
    if (STRONG_MATH_MARKERS.has(ch)) return true;
    const code = ch.codePointAt(0) ?? 0;
    if (isSuperSubscriptCode(code)) return true;
    if (isMathAlphanumericCode(code)) return true;
  }
  return false;
}

/**
 * ASCII equation helpers common in PDF text extraction: caret superscripts
 * (`x^2`) and underscore subscripts (`a_i`). Alone they are weak; combined
 * with `=` they strongly suggest a formula.
 */
function hasAsciiEquationShape(text: string): boolean {
  const hasEquals = text.includes('=');
  const hasCaret = /\w\^\w/.test(text) || /\w\^\{/.test(text);
  const hasUnderscore = /\w_\w/.test(text) || /\w_\{/.test(text);
  return hasEquals && (hasCaret || hasUnderscore);
}

/**
 * Fraction of non-space characters that look mathematical (operators, Greek,
 * super/subscripts, math alphanumeric, parentheses around short symbols).
 */
function mathSymbolDensity(text: string): number {
  let total = 0;
  let mathish = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    total++;
    if (isMathSymbolChar(ch) || STRONG_MATH_MARKERS.has(ch)) {
      mathish++;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (isSuperSubscriptCode(code) || isMathAlphanumericCode(code)) {
      mathish++;
      continue;
    }
    // ASCII operators that appear densely in formulas (weaker alone).
    if ('=+-*/<>|()[]{}'.includes(ch)) {
      mathish++;
    }
  }
  return total === 0 ? 0 : mathish / total;
}

/**
 * Classify a paragraph as prose or pure-math.
 *
 * Conservative by design: mixed prose-with-inline-math returns `'prose'` and
 * relies on the translation prompt to preserve the math. Only paragraphs
 * clearly dominated by math (block delimiters, standalone inline formulas,
 * short marker-bearing fragments, density-heavy longer formulas, or ASCII
 * equation shapes) are flagged `'math'`.
 */
export function classifyMathParagraph(text: string): ParagraphKind {
  if (text.trim() === '') return 'prose';

  // 1. Block-level LaTeX — always math, regardless of length.
  for (const pattern of LATEX_BLOCK_PATTERNS) {
    if (pattern.test(text)) return 'math';
  }

  // 2. Standalone inline LaTeX — math only if short prose around it.
  const inlineMatch = text.match(INLINE_LATEX_PATTERN);
  if (inlineMatch) {
    const outside = stripLatexBlocks(text);
    if (
      inlineMatch[1]?.length >= INLINE_LATEX_MIN_INNER_CHARS ||
      inlineMatch[2]?.length >= INLINE_LATEX_MIN_INNER_CHARS
    ) {
      if (countWords(outside) <= INLINE_LATEX_MAX_OUTSIDE_WORDS) return 'math';
    }
  }

  const words = countWords(text);

  // 3. Short string with a decisive math marker (Greek letter, =, ∑, ∫,
  //    super/subscript, math alphanumeric, etc.) — Unicode math without LaTeX.
  if (words <= SHORT_MATH_MAX_WORDS && hasStrongMathMarker(text)) {
    return 'math';
  }

  // 4. ASCII caret/underscore equation shapes (PDF-extracted TeX-ish text).
  if (words <= SHORT_MATH_MAX_WORDS && hasAsciiEquationShape(text)) {
    return 'math';
  }

  // 5. Longer density-dominated formulas (multi-term PDF equations).
  //    Requires at least one strong marker so prose with occasional punctuation
  //    never trips the density path.
  if (
    words <= DENSITY_MATH_MAX_WORDS &&
    hasStrongMathMarker(text) &&
    mathSymbolDensity(text) >= DENSITY_MATH_MIN_RATIO
  ) {
    return 'math';
  }

  return 'prose';
}

// ── Table / figure cell heuristics ──────────────────────────────────────────

/** Max words for a spatial "table cell" candidate. */
const CELL_MAX_WORDS = 6;
/** Max characters for a spatial "table cell" candidate. */
const CELL_MAX_CHARS = 48;
/** Y tolerance for grouping paragraphs into the same table row (PDF units). */
const ROW_Y_TOLERANCE = 4;
/** Minimum cells in one row to treat that row as a table header/row. */
const MIN_CELLS_SINGLE_ROW = 3;
/** Minimum multi-cell rows on a page to treat a 2-column grid as a table. */
const MIN_MULTI_CELL_ROWS = 2;
/** Minimum cells per row for the multi-row grid path. */
const MIN_CELLS_MULTI_ROW = 2;

/**
 * Pure numeric / percent / currency / short metric fragments that almost never
 * need translation (table body cells, axis ticks).
 */
const NUMERICISH_PATTERN =
  /^[$€£¥]?\s*[\d]+(?:[.,]\d+)?\s*(?:[%‰]|x|×)?$/i;
const NUMERICISH_LOOSE =
  /^[\d\s.,%+\-–—$€£¥/()×x:]+$/;

function isNumericishFragment(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return false;
  if (t.length > CELL_MAX_CHARS) return false;
  if (NUMERICISH_PATTERN.test(t)) return true;
  // Multi-token numeric rows like "12.5  0.3  98%"
  if (NUMERICISH_LOOSE.test(t) && /\d/.test(t) && countWords(t) <= CELL_MAX_WORDS) {
    return true;
  }
  return false;
}

function isCellLikeText(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return false;
  if (t.length > CELL_MAX_CHARS) return false;
  if (countWords(t) > CELL_MAX_WORDS) return false;
  if (isNumericishFragment(t)) return true;
  // Short labels (Model, Acc, F1, Train) — only safe when spatial context
  // confirms a table row; this helper is used inside row clustering.
  return countWords(t) <= 3;
}

/**
 * Group paragraphs into horizontal rows by Y coordinate (PDF space, top-down).
 */
function groupIntoRows(paragraphs: PdfParagraph[]): PdfParagraph[][] {
  const sorted = [...paragraphs].sort((a, b) => {
    if (Math.abs(a.y - b.y) > ROW_Y_TOLERANCE) return b.y - a.y;
    return a.x - b.x;
  });
  const rows: PdfParagraph[][] = [];
  for (const p of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].y - p.y) <= ROW_Y_TOLERANCE) {
      last.push(p);
    } else {
      rows.push([p]);
    }
  }
  return rows;
}

/**
 * Rule-based table/figure cell detection from page-level paragraph geometry.
 *
 * Returns paragraph ids that should be treated as `figure` (kept verbatim,
 * never masked in Layout mode). Deterministic and free — complements the LLM
 * classifier for ambiguous non-cell labels.
 *
 * Signals:
 * 1. Pure numeric / percent / currency fragments (any position)
 * 2. A single row with ≥3 short cell-like labels
 * 3. ≥2 rows that each have ≥2 short cell-like labels (2-column+ grids)
 *
 * Headings (`isHeading`) and long prose are never flagged.
 */
export function classifyTableLikeParagraphs(paragraphs: PdfParagraph[]): Set<string> {
  const figureIds = new Set<string>();

  for (const p of paragraphs) {
    if (p.isHeading) continue;
    if (isNumericishFragment(p.text)) {
      figureIds.add(p.id);
    }
  }

  const rows = groupIntoRows(paragraphs);
  const multiCellRows: PdfParagraph[][] = [];

  for (const row of rows) {
    const cells = row.filter((p) => !p.isHeading && isCellLikeText(p.text));
    if (cells.length >= MIN_CELLS_SINGLE_ROW) {
      for (const c of cells) figureIds.add(c.id);
    }
    if (cells.length >= MIN_CELLS_MULTI_ROW) {
      multiCellRows.push(cells);
    }
  }

  if (multiCellRows.length >= MIN_MULTI_CELL_ROWS) {
    for (const cells of multiCellRows) {
      for (const c of cells) figureIds.add(c.id);
    }
  }

  return figureIds;
}

// ── Prose short-circuit heuristic ───────────────────────────────────────────

/**
 * Characters considered "latin" for the prose heuristic: basic letters,
 * digits, and common ASCII + typographic punctuation. Spaces are handled
 * separately in `isObviouslyProse` (they count towards the latin ratio but
 * are not tested here). Characters not in this set and not math symbols
 * (e.g. CJK, emoji) count against the latin ratio without counting as
 * math symbols.
 */
const LATIN_OR_PUNCT = /[a-zA-Z0-9.,;:!?'"\-–—()[\]/…\u2019\u201C\u201D\u2018]/;

/**
 * Does the text contain any LaTeX delimiters (block-level or standalone
 * inline with substantial inner content)? Reuses the patterns from
 * `classifyMathParagraph` so that `isObviouslyProse` never short-circuits
 * text the math detector would flag.
 */
function containsLatexDelimiters(text: string): boolean {
  for (const pattern of LATEX_BLOCK_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return INLINE_LATEX_PATTERN.test(text);
}

/**
 * Is the character a math/special symbol? Broader than `hasStrongMathMarker`
 * (which is a presence check) — this is used for density counting and
 * includes Unicode mathematical operator ranges beyond the explicit marker
 * set.
 */
function isMathSymbolChar(ch: string): boolean {
  if (STRONG_MATH_MARKERS.has(ch)) return true;
  const code = ch.codePointAt(0) ?? 0;
  if (isSuperSubscriptCode(code)) return true;
  return (
    (code >= 0x2200 && code <= 0x22ff) || // Mathematical Operators (∀ ∂ ∑ ∫ …)
    (code >= 0x2a00 && code <= 0x2aff) || // Supplemental Math Operators
    (code >= 0x27c0 && code <= 0x27ef) || // Misc Math Symbols-A
    (code >= 0x2980 && code <= 0x29ff) // Misc Math Symbols-B
  );
}

/**
 * Minimum character length for the prose short-circuit. Short text might be a
 * figure label or caption, so it should go through the LLM classifier.
 */
const PROSE_MIN_CHARS = 80;

/**
 * Minimum word count for the prose short-circuit. A short word count suggests
 * a label, title, or formula rather than a prose paragraph.
 */
const PROSE_MIN_WORDS = 15;

/** Latin characters (letters, digits, punctuation, spaces) must be ≥ this ratio. */
const PROSE_MIN_LATIN_RATIO = 0.8;

/** Math/special symbols must be < this ratio for the prose short-circuit. */
const PROSE_MAX_SYMBOL_RATIO = 0.1;

/**
 * Deterministic heuristic: returns true if a paragraph is obviously prose
 * (long, latin-heavy, low symbol density) and can skip the LLM classification
 * call. Complements `classifyMathParagraph` — if that returns `'math'`, this
 * is never called. Never classifies math/figure as prose.
 *
 * Criteria (ALL must be true):
 * 1. Length: ≥ 80 characters (short text might be a figure label)
 * 2. Word count: ≥ 15 words
 * 3. No LaTeX delimiters (block or inline) — safety guard
 * 4. No strong math markers (Greek letters, =, ∑, ∫, super/subscripts, etc.)
 * 5. Latin ratio: ≥ 80% of characters are latin letters/spaces/punctuation
 * 6. Symbol density: < 10% math/special symbols (Unicode math markers)
 *
 * Conservative by design — when in doubt, returns false so the LLM classifier
 * makes the final call.
 */
export function isObviouslyProse(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < PROSE_MIN_CHARS) return false;

  const words = trimmed.split(/\s+/);
  if (words.length < PROSE_MIN_WORDS) return false;

  // Safety: never short-circuit text containing LaTeX delimiters or strong
  // math markers. This guarantees isObviouslyProse() returns false for any
  // text that classifyMathParagraph() would flag as math.
  if (containsLatexDelimiters(trimmed)) return false;
  if (hasStrongMathMarker(trimmed)) return false;

  let total = 0;
  let latin = 0;
  let symbols = 0;

  for (const ch of trimmed) {
    if (/\s/.test(ch)) {
      total++;
      latin++; // spaces count as latin
      continue;
    }
    total++;
    if (LATIN_OR_PUNCT.test(ch)) {
      latin++;
    } else if (isMathSymbolChar(ch)) {
      symbols++;
    }
    // Other characters (CJK, emoji, etc.) count against latin ratio but
    // not as math symbols.
  }

  if (total === 0) return false;
  const latinRatio = latin / total;
  const symbolRatio = symbols / total;

  return latinRatio >= PROSE_MIN_LATIN_RATIO && symbolRatio < PROSE_MAX_SYMBOL_RATIO;
}
