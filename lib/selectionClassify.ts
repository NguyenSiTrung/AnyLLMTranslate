/**
 * Client-side heuristic: classify a text selection as dictionary (word) mode
 * vs sentence (translation) mode.
 *
 * Pure function — no I/O, no side effects.
 */

/** Max whitespace-separated tokens for dictionary-mode candidacy. */
export const MAX_DICTIONARY_TOKENS = 3;

/**
 * Sentence-ending punctuation. If the trimmed selection ends with one of these,
 * treat as sentence-mode even when short.
 * Covers Latin `.?!…` and CJK `。？！` (and fullwidth ellipsis `…` / `⋯`).
 */
export const SENTENCE_END_PUNCT = /[.?!。？！…⋯]$/u;

/**
 * Returns true when `text` is a dictionary-mode candidate:
 * - trimmed, non-empty
 * - 1–MAX_DICTIONARY_TOKENS whitespace-separated tokens
 * - does not end with sentence punctuation
 *
 * A single CJK (or other non-space) token counts as one token.
 * Empty/whitespace → false. Long multi-token or sentence-ending punct → false.
 */
export function isDictionaryModeCandidate(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }

  if (SENTENCE_END_PUNCT.test(trimmed)) {
    return false;
  }

  const tokens = trimmed.split(/\s+/u).filter((t) => t.length > 0);
  if (tokens.length === 0 || tokens.length > MAX_DICTIONARY_TOKENS) {
    return false;
  }

  return true;
}
