/** Max context characters (default 300). */
export const SELECTION_CONTEXT_MAX_CHARS = 300;

const BLOCK_ANCESTOR_RE =
  /^(P|DIV|LI|TD|TH|ARTICLE|SECTION|BLOCKQUOTE|MAIN|BODY)$/i;

/**
 * Collapse whitespace runs to single spaces and trim ends.
 */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Prefer a window of `maxChars` centered on the first occurrence of
 * `selectedText` in `text`. Falls back to a prefix slice when the selection
 * is not found.
 */
function windowAroundSelection(
  text: string,
  selectedText: string,
  maxChars: number
): string {
  if (text.length <= maxChars) return text;

  const needle = collapseWhitespace(selectedText);
  const idx = needle ? text.indexOf(needle) : -1;
  if (idx === -1) return text.slice(0, maxChars);

  const half = Math.floor((maxChars - needle.length) / 2);
  let start = Math.max(0, idx - half);
  let end = start + maxChars;

  if (end > text.length) {
    end = text.length;
    start = Math.max(0, end - maxChars);
  }

  return text.slice(start, end);
}

/**
 * Given a Range, get text from the nearest block-ish ancestor
 * (p, div, li, td, article, section, or body).
 */
export function getSurroundingTextFromRange(range: Range): string {
  try {
    let node: Node | null = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      node = (node as Text).parentElement;
    }

    while (node && node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (BLOCK_ANCESTOR_RE.test(el.tagName)) {
        return el.textContent ?? '';
      }
      if (el.tagName === 'HTML') {
        return el.textContent ?? '';
      }
      node = el.parentElement;
    }

    return '';
  } catch {
    return '';
  }
}

/**
 * Extract capped surrounding text for a selection.
 * Prefer: (1) provided parentText (2) Range's nearest block ancestor textContent.
 * Cap to SELECTION_CONTEXT_MAX_CHARS (trim ends).
 * Returns '' on failure/empty.
 */
export function extractSelectionContext(options: {
  /** Selected text (used to center/window context if parent is longer) */
  selectedText: string;
  /** Optional pre-fetched surrounding text (paragraph/sentence) */
  parentText?: string;
  /** Optional DOM Range (browser/jsdom) */
  range?: Range | null;
  maxChars?: number;
}): string {
  try {
    const maxChars = options.maxChars ?? SELECTION_CONTEXT_MAX_CHARS;
    const selectedText = options.selectedText ?? '';

    let raw = '';
    const parent = options.parentText?.trim() ?? '';
    if (parent) {
      raw = parent;
    } else if (options.range) {
      raw = getSurroundingTextFromRange(options.range);
    } else {
      return '';
    }

    const normalized = collapseWhitespace(raw);
    if (!normalized) return '';

    return windowAroundSelection(normalized, selectedText, maxChars);
  } catch {
    return '';
  }
}
