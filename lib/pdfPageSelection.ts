/**
 * pdfPageSelection — parse and validate pdf2zh-style page selections.
 *
 * Syntax: 1-based tokens `n` or `n-m` (inclusive), comma-separated,
 * whitespace tolerated — e.g. `1-3, 5, 8-10`. Shared by the viewer UI
 * (bounds-checked) and the background pass-through validation
 * (syntax-checked), mirroring the bridge's JobConfig validation.
 */

/** One `n` or `n-m` token (inclusive, 1-based). */
const TOKEN_RE = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/;

export interface PageSelection {
  /** 1-based, sorted, unique pages. Empty when invalid. */
  pages: number[];
  /** Human-readable message when the selection is invalid. */
  error?: string;
}

/**
 * Syntax-only validation and expansion. Returns 1-based sorted unique
 * pages, or null when the string is malformed. No document bound checks —
 * used where the total page count is unknown (background pass-through).
 */
export function parsePagesSpec(input: string): number[] | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const pages = new Set<number>();
  for (const rawToken of trimmed.split(',')) {
    const m = TOKEN_RE.exec(rawToken);
    if (!m) return null;
    const start = Number(m[1]);
    const end = m[2] !== undefined ? Number(m[2]) : start;
    if (start < 1 || end < start) return null;
    for (let p = start; p <= end; p++) pages.add(p);
  }
  return [...pages].sort((a, b) => a - b);
}

/**
 * Full validation for the viewer: syntax plus bounds against the document
 * page count. Pass `numPages: 0` when the total is still unknown — the
 * upper-bound check is skipped but syntax is still enforced.
 */
export function parsePageSelection(input: string, numPages: number): PageSelection {
  const trimmed = input.trim();
  if (!trimmed) {
    return { pages: [], error: 'Enter at least one page' };
  }

  const pages = new Set<number>();
  const tokens = trimmed.split(',');
  for (const rawToken of tokens) {
    const m = TOKEN_RE.exec(rawToken);
    const start = m ? Number(m[1]) : NaN;
    const end = m?.[2] !== undefined ? Number(m[2]) : start;
    if (!m || end < start) {
      return { pages: [], error: `"${rawToken.trim()}" is not a valid page or range` };
    }
    if (start < 1) {
      return { pages: [], error: 'Page numbers start at 1' };
    }
    if (numPages > 0 && (start > numPages || end > numPages)) {
      const over = start > numPages ? start : end;
      return { pages: [], error: `Page ${over} is out of range (1-${numPages})` };
    }
    for (let p = start; p <= end; p++) pages.add(p);
  }

  return { pages: [...pages].sort((a, b) => a - b) };
}
