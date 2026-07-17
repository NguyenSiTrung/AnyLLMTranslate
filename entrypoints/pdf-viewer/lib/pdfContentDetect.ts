/**
 * Pure, synchronous content detection for PDF paragraphs.
 *
 * Used by `translateParagraphs()` to decide which paragraphs to skip
 * translation for:
 * - **Math** — rule-based on text alone (`classifyMathParagraph`) and
 *   multi-signal run-level detection (`classifyRuns`, font name, size ratio)
 * - **Table/figure cells** — rule-based spatial + numeric heuristics
 *   (`classifyTableLikeParagraphs`); remaining ambiguous labels still go
 *   through the LLM classifier in `pdfTranslation.ts`
 *
 * Why pure/synchronous? It is deterministic, free (no API call), trivially
 * unit-testable, and immune to network failure. The math rules are
 * conservative: a paragraph is only flagged `'math'` when it is clearly
 * dominated by mathematical content. Mixed prose-with-inline-math stays
 * `'prose'` at paragraph level (unless formula-dominated via runs) and uses
 * placeholders for formula runs in the composition pipeline.
 *
 * Font/size heuristics are reimplemented from public methodology (not AGPL
 * source copy of BabelDOC / PDFMathTranslate).
 */

import type { PdfParagraph, PdfTextRun } from './pdfTextExtraction';

/** Result of classifying a paragraph's content kind (math path). */
export type ParagraphKind = 'prose' | 'math';

/** Full content kind used end-to-end in the PDF pipeline. */
export type ContentKind = 'prose' | 'math' | 'figure';

/** Per-run classification used by composition placeholders. */
export type RunKind = 'prose' | 'formula';

/** Options for run-level / stricter math detection. */
export interface MathDetectOptions {
  /**
   * When true, tighten font/size/density thresholds so more borderline
   * runs/paragraphs are treated as formula/math.
   */
  strictMath?: boolean;
}

/**
 * Size ratio vs line median below which a run is treated as sub/superscript
 * formula (PDFMathTranslate-style vflag). Default ~0.79.
 */
const FORMULA_SIZE_RATIO = 0.79;
/** Stricter size ratio when `strictMath` is on. */
const FORMULA_SIZE_RATIO_STRICT = 0.85;

/**
 * Minimum fraction of formula runs (by character length) for a paragraph with
 * runs to be classified as pure `math` rather than mixed prose.
 */
const FORMULA_DOMINATED_RATIO = 0.55;
const FORMULA_DOMINATED_RATIO_STRICT = 0.4;

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

// ── Font-name formula signals (reimplemented heuristics) ───────────────────

/**
 * Substrings / patterns typical of TeX, Computer Modern Math, AMS, STIX, and
 * Symbol-family fonts as exposed by PDF.js `fontName`. Case-insensitive.
 * Intentionally does **not** flag generic body fonts (Times, Helvetica, etc.).
 */
// Note: PDF.js names often use underscores (`g_d0_CMMI10`). JS `\b` treats `_`
// as a word char, so patterns avoid leading `\b` and match the family token.
const FORMULA_FONT_PATTERNS: RegExp[] = [
  /cmmi\d*/i, // Computer Modern Math Italic
  /cmsy\d*/i, // Computer Modern Symbol
  /cmex\d*/i, // Computer Modern Extension
  /msbm\d*/i, // AMS blackboard
  /msam\d*/i, // AMS symbols
  /eufm\d*/i, // Euler Fraktur
  /eurm\d*/i, // Euler Roman
  /rsfs\d*/i, // Ralph Smith's Formal Script
  /stix/i,
  /asana.?math/i,
  /latin.?modern.?math/i,
  /cambria.?math/i,
  /xits.?math/i,
  /fira.?math/i,
  /gfs.?neohellenic.?math/i,
  /tex.?math/i,
  /math(?:italic|symbol|extension|operators)?/i,
  /equation/i,
  /(?:^|[^a-z])symbol(?:$|[^a-z])/i, // Adobe Symbol (avoid "symbolic")
  /zapfdingbats/i,
  /MT(?:MI|SY|EX)/i, // MathTime
  /Euclid/i,
];

/**
 * True when `fontName` looks like a TeX/math/symbol family.
 * Sparse/empty names return false (never require font alone for decisions).
 * Plain Computer Modern Roman (`cmr`) is body text — not flagged.
 */
export function isFormulaFontName(fontName: string): boolean {
  const name = fontName.trim();
  if (name.length === 0) return false;
  for (const re of FORMULA_FONT_PATTERNS) {
    if (re.test(name)) return true;
  }
  return false;
}

/**
 * Classify each run as `prose` or `formula` using font name, size ratio vs
 * line median, and Unicode/LaTeX text signals.
 *
 * Order of signals (any match → formula, unless empty):
 * 1. Formula font name
 * 2. Run height < ratio × median height of runs on the same y-band
 * 3. Text would be math under `classifyMathParagraphText` for the run alone
 */
export function classifyRuns(
  runs: PdfTextRun[],
  options?: MathDetectOptions,
): RunKind[] {
  if (runs.length === 0) return [];

  const strict = options?.strictMath === true;
  const sizeRatio = strict ? FORMULA_SIZE_RATIO_STRICT : FORMULA_SIZE_RATIO;

  // Median font size across all runs (line-level proxy when runs share a line).
  const sizes = runs.map((r) => r.fontSize || r.height || 0).filter((s) => s > 0);
  const sorted = [...sizes].sort((a, b) => a - b);
  const median =
    sorted.length === 0 ? 10 : sorted[Math.floor(sorted.length / 2)] || 10;

  return runs.map((run) => {
    const text = run.text.trim();
    if (text.length === 0) return 'prose';

    if (isFormulaFontName(run.fontName)) return 'formula';

    const size = run.fontSize || run.height || 0;
    if (size > 0 && size < median * sizeRatio) return 'formula';

    // Text-only signals on the run alone (short fragments).
    if (classifyMathParagraphText(run.text, options) === 'math') return 'formula';

    // Strong markers on tiny runs (single symbols) even if word path misses.
    if (hasStrongMathMarker(run.text) && countWords(run.text) <= 4) return 'formula';

    return 'prose';
  });
}

/**
 * True when formula runs dominate the paragraph by character weight.
 */
export function isFormulaDominated(
  runs: PdfTextRun[],
  options?: MathDetectOptions,
): boolean {
  if (!runs || runs.length === 0) return false;
  const kinds = classifyRuns(runs, options);
  let formulaChars = 0;
  let totalChars = 0;
  for (let i = 0; i < runs.length; i++) {
    const n = runs[i].text.replace(/\s+/g, '').length;
    totalChars += n;
    if (kinds[i] === 'formula') formulaChars += n;
  }
  if (totalChars === 0) return false;
  const threshold = options?.strictMath
    ? FORMULA_DOMINATED_RATIO_STRICT
    : FORMULA_DOMINATED_RATIO;
  return formulaChars / totalChars >= threshold;
}

/**
 * Classify a paragraph as prose or pure-math (text-only entry point).
 *
 * Conservative by design: mixed prose-with-inline-math returns `'prose'` and
 * relies on placeholders / prompt for math preservation. Only paragraphs
 * clearly dominated by math are flagged `'math'`.
 *
 * When `paragraph.runs` is provided (or via overload helpers), run-level
 * formula domination can upgrade the result to `'math'`.
 */
export function classifyMathParagraph(
  text: string,
  options?: MathDetectOptions,
): ParagraphKind {
  return classifyMathParagraphText(text, options);
}

/**
 * Classify a `PdfParagraph`, optionally using run-level multi-signal detection
 * when `runs` are present.
 */
export function classifyMathParagraphFromParagraph(
  paragraph: PdfParagraph,
  options?: MathDetectOptions,
): ParagraphKind {
  if (paragraph.runs && paragraph.runs.length > 0) {
    if (isFormulaDominated(paragraph.runs, options)) return 'math';
  }
  return classifyMathParagraphText(paragraph.text, options);
}

function classifyMathParagraphText(
  text: string,
  options?: MathDetectOptions,
): ParagraphKind {
  if (text.trim() === '') return 'prose';

  const strict = options?.strictMath === true;
  const densityMin = strict ? DENSITY_MATH_MIN_RATIO * 0.75 : DENSITY_MATH_MIN_RATIO;
  const shortMax = strict ? SHORT_MATH_MAX_WORDS + 4 : SHORT_MATH_MAX_WORDS;

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

  // Prose that merely *introduces* a formula (…objective: J=…) is not pure math.
  // Those paragraphs are split at extraction; classification must stay prose so
  // Layout can still paint the translated intro.
  if (hasProseIntroducingFormula(text)) {
    return 'prose';
  }

  // 3. Short string with a decisive math marker (Greek letter, =, ∑, ∫,
  //    super/subscript, math alphanumeric, etc.) — Unicode math without LaTeX.
  if (words <= shortMax && hasStrongMathMarker(text)) {
    return 'math';
  }

  // 4. ASCII caret/underscore equation shapes (PDF-extracted TeX-ish text).
  if (words <= shortMax && hasAsciiEquationShape(text)) {
    return 'math';
  }

  // 5. Longer density-dominated formulas (multi-term PDF equations).
  //    Requires at least one strong marker so prose with occasional punctuation
  //    never trips the density path.
  if (
    words <= DENSITY_MATH_MAX_WORDS &&
    hasStrongMathMarker(text) &&
    mathSymbolDensity(text) >= densityMin
  ) {
    return 'math';
  }

  // 6. Display equations from scientific PDFs (often end with "(1)" and have
  //    dense operators; PDF.js may not expose TeX font names).
  if (looksLikeDisplayEquation(text)) {
    return 'math';
  }

  return 'prose';
}

/**
 * True when text looks like a standalone display equation line from a paper
 * (high operator density, trailing equation number, nested parens, etc.).
 * Used as a failsafe when font names are hashed and LaTeX delimiters are absent.
 *
 * Note: ASCII math (`min`, `clip`, `exp`) still has a high Latin-letter ratio,
 * so we do **not** require a low letter ratio when other equation signals fire.
 */
export function looksLikeDisplayEquation(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length < 4) return false;

  // Long multi-sentence prose — never a display equation alone.
  // (Merged prose+equation is handled by splitting lines at extraction.)
  if (countWords(t) > 55) return false;
  // Multiple sentence terminators strongly suggest prose paragraphs.
  const sentenceEnds = (t.match(/[.!?]["']?\s+[A-Z]/g) ?? []).length;
  if (sentenceEnds >= 2) return false;

  const words = countWords(t);
  const density = mathSymbolDensity(t);
  const hasEquals = t.includes('=');
  // Trailing or near-end equation number: ... (1)  or  ...(12)
  const hasEqNum = /\(\s*\d{1,3}\s*\)\s*$/.test(t);
  // Nested parentheses / brackets common in multi-term objectives.
  const openParens = (t.match(/[([{]/g) ?? []).length;
  const closeParens = (t.match(/[)\]}]/g) ?? []).length;
  const nestedMath =
    openParens >= 2 &&
    closeParens >= 2 &&
    hasEquals &&
    density >= 0.12;

  // Prose introducing a formula (colon / long English head before '=') —
  // not a pure display equation line (split at extraction instead).
  const proseHead = hasProseIntroducingFormula(t);

  // Numbered display equation (classic paper layout).
  // Require a real formula signal beyond a trailing "(n)" alone (tofu
  // translations like "Viet intro: □□□ (5)" must NOT match).
  if (
    hasEqNum &&
    hasEquals &&
    (density >= 0.1 || hasStrongMathMarker(t) || openParens >= 2)
  ) {
    if (proseHead) return false;
    return true;
  }

  // Unnumbered but formula-shaped: equals + operator density + not a long English clause.
  if (hasEquals && density >= 0.18 && words <= 45) {
    if (proseHead) return false;
    // Reject "X = the number of cats in the house" style prose definitions:
    // many consecutive English words after '=' with almost no operators.
    const afterEq = t.split('=').slice(1).join('=');
    const afterWords = countWords(afterEq);
    const afterDensity = mathSymbolDensity(afterEq);
    if (afterWords >= 8 && afterDensity < 0.12 && !hasStrongMathMarker(afterEq)) {
      return false;
    }
    return true;
  }

  // Nested multi-term objectives without a clean trailing number (number may
  // be a separate PDF text item on the right margin).
  if (nestedMath && words <= 45) {
    return true;
  }

  // Very dense math fragment / glyph soup.
  if (density >= 0.3 && words <= 25 && (hasEquals || hasStrongMathMarker(t))) {
    return true;
  }

  // Lone equation number on the right margin — treat as non-overlay chrome
  // (no translation value; keep canvas).
  if (/^\(\s*\d{1,3}\s*\)$/.test(t)) {
    return true;
  }

  return false;
}

/**
 * True when text is English/prose that *introduces* a formula (typically
 * "…objective: J(θ)=…") rather than being a pure display equation.
 */
export function hasProseIntroducingFormula(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length < 12) return false;

  // Colon-introduced equation: "… objective: <formula>"
  // (Do not call looksLikeDisplayEquation here — it uses this helper.)
  const colon = t.lastIndexOf(':');
  if (colon >= 8) {
    const head = t.slice(0, colon).trim();
    const tail = t.slice(colon + 1).trim();
    const tailLooksEq =
      (tail.includes('=') && mathSymbolDensity(tail) >= 0.12) ||
      (/\(\s*\d{1,3}\s*\)\s*$/.test(tail) &&
        (tail.includes('=') || mathSymbolDensity(tail) >= 0.15));
    if (countWords(head) >= 4 && mathSymbolDensity(head) < 0.12 && tailLooksEq) {
      return true;
    }
  }

  // Long English span before first '='.
  if (t.includes('=')) {
    const beforeEq = t.split('=')[0] ?? '';
    if (countWords(beforeEq) >= 8 && mathSymbolDensity(beforeEq) < 0.12) {
      return true;
    }
  }
  return false;
}

/**
 * If `text` is prose introducing a trailing display equation (common after
 * line-merge: "…objective: J(θ)=…(5)"), return the prose prefix only.
 * Otherwise return the original string unchanged.
 */
export function stripTrailingDisplayEquation(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length < 8) return text;

  // Prefer split on the last colon (… objective: <equation>).
  const colon = t.lastIndexOf(':');
  if (colon >= 0 && colon < t.length - 4) {
    const after = t.slice(colon + 1).trim();
    if (
      looksLikeDisplayEquation(after) ||
      (hasUnsafeOverlayGlyphs(after) && after.includes('='))
    ) {
      return t.slice(0, colon + 1).trim();
    }
  }

  // Trailing numbered equation without a colon: drop from the last "=" cluster
  // that ends with (n), but only when the suffix itself is equation-shaped.
  const eqNumMatch = t.match(/^(.*?)(\S[^=]{0,20}=.{4,200}\(\s*\d{1,3}\s*\))\s*$/);
  if (eqNumMatch?.[1] && eqNumMatch[2]) {
    const head = eqNumMatch[1].trim();
    const tail = eqNumMatch[2].trim();
    if (head.length >= 12 && looksLikeDisplayEquation(tail)) {
      return head;
    }
  }

  return text;
}

/**
 * True when overlay text contains glyphs that web/pdf-lib fonts cannot paint
 * (□ tofu, replacement char, private-use). Such text must never cover the
 * original canvas formula layer.
 */
export function hasUnsafeOverlayGlyphs(text: string): boolean {
  if (!text) return false;
  let bad = 0;
  let total = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    total++;
    const code = ch.codePointAt(0) ?? 0;
    if (
      ch === '\uFFFD' ||
      ch === '□' ||
      ch === '■' ||
      ch === '▫' ||
      ch === '▪' ||
      (code >= 0xe000 && code <= 0xf8ff) // BMP private use
    ) {
      bad++;
    }
  }
  if (total === 0) return false;
  // Any tofu in a short string, or ≥5% in longer strings.
  return bad >= 1 && (total <= 24 || bad / total >= 0.05);
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
  return classifyTableRegions(paragraphs).figureIds;
}

/** Axis-aligned table region built from short cell clusters. */
export interface TableRegion {
  /** Left edge in PDF space. */
  x: number;
  /** Top edge in PDF space (max y of cells). */
  y: number;
  width: number;
  height: number;
  /** Paragraph ids that form the cell grid (not captions outside). */
  paragraphIds: string[];
}

export interface TableRegionResult {
  regions: TableRegion[];
  /** Default figure ids: cells in regions + standalone numeric fragments. */
  figureIds: Set<string>;
  /** Ids of paragraphs inside a table region (superset of region cells that
   *  fall inside the expanded bounding box — still excludes long captions). */
  regionParagraphIds: Set<string>;
}

/**
 * Detect table **regions** (grids of short cells / multi-row clusters) and
 * return region geometry + figure ids.
 *
 * Captions outside the grid (long sentence-like text near the table) are not
 * included. Numeric cells are always figure candidates.
 */
export function classifyTableRegions(paragraphs: PdfParagraph[]): TableRegionResult {
  const figureIds = new Set<string>();
  const regionParagraphIds = new Set<string>();
  const regions: TableRegion[] = [];

  for (const p of paragraphs) {
    if (p.isHeading) continue;
    if (isNumericishFragment(p.text)) {
      figureIds.add(p.id);
    }
  }

  const rows = groupIntoRows(paragraphs);
  const multiCellRows: PdfParagraph[][] = [];
  const singleRowClusters: PdfParagraph[][] = [];

  for (const row of rows) {
    const cells = row.filter((p) => !p.isHeading && isCellLikeText(p.text));
    if (cells.length >= MIN_CELLS_SINGLE_ROW) {
      for (const c of cells) figureIds.add(c.id);
      singleRowClusters.push(cells);
    }
    if (cells.length >= MIN_CELLS_MULTI_ROW) {
      multiCellRows.push(cells);
    }
  }

  const regionCellSets: PdfParagraph[][] = [];
  if (multiCellRows.length >= MIN_MULTI_CELL_ROWS) {
    for (const cells of multiCellRows) {
      for (const c of cells) figureIds.add(c.id);
    }
    // One region spanning all multi-cell rows when they share similar x-span.
    regionCellSets.push(multiCellRows.flat());
  }
  for (const cells of singleRowClusters) {
    // Already flagged as figure; only form a region if not already covered.
    if (multiCellRows.length < MIN_MULTI_CELL_ROWS) {
      regionCellSets.push(cells);
    }
  }

  for (const cells of regionCellSets) {
    if (cells.length === 0) continue;
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    const ids: string[] = [];
    for (const c of cells) {
      xMin = Math.min(xMin, c.x);
      xMax = Math.max(xMax, c.x + c.width);
      yMin = Math.min(yMin, c.y - c.height);
      yMax = Math.max(yMax, c.y);
      ids.push(c.id);
      regionParagraphIds.add(c.id);
    }
    // Small padding so nearby short labels inside the grid are covered.
    const pad = 4;
    const region: TableRegion = {
      x: xMin - pad,
      y: yMax + pad,
      width: xMax - xMin + pad * 2,
      height: yMax - yMin + pad * 2,
      paragraphIds: ids,
    };
    regions.push(region);

    // Mark other short cell-like paragraphs fully contained in the region.
    for (const p of paragraphs) {
      if (p.isHeading || regionParagraphIds.has(p.id)) continue;
      if (!isCellLikeText(p.text)) continue;
      // Long sentence-like captions stay out (isCellLikeText already caps words).
      const cx = p.x + p.width / 2;
      const cy = p.y;
      const inside =
        cx >= region.x &&
        cx <= region.x + region.width &&
        cy <= region.y &&
        cy >= region.y - region.height;
      if (inside) {
        figureIds.add(p.id);
        regionParagraphIds.add(p.id);
        region.paragraphIds.push(p.id);
      }
    }
  }

  return { regions, figureIds, regionParagraphIds };
}

/**
 * Whether a paragraph inside a table region should stay verbatim when
 * `translateTableText` is enabled. Numeric cells always protected.
 */
export function isProtectedTableCell(text: string): boolean {
  return isNumericishFragment(text);
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
