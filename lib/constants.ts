/**
 * DOM element classification constants for the DOM walker.
 * Determines how elements are treated during translation piece extraction.
 */

/** Block-level elements that split translation pieces */
export const BLOCK_ELEMENTS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS',
  'DIALOG', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE',
  'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'HEADER', 'HGROUP', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P',
  'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH',
  'THEAD', 'TR', 'UL', 'SUMMARY',
]);

/** Elements to skip entirely during traversal */
export const SKIP_ELEMENTS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED',
  'APPLET', 'AUDIO', 'VIDEO', 'CANVAS', 'MAP', 'SVG', 'MATH',
  'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'OPTION', 'OPTGROUP',
  'CODE', 'PRE', 'KBD', 'SAMP', 'VAR',
]);

/** Inline elements that stay within a translation piece */
export const INLINE_ELEMENTS = new Set([
  'A', 'ABBR', 'ACRONYM', 'B', 'BDI', 'BDO', 'BIG', 'BR',
  'CITE', 'DATA', 'DEL', 'DFN', 'EM', 'FONT', 'I', 'IMG',
  'INS', 'LABEL', 'MARK', 'METER', 'OUTPUT', 'PROGRESS', 'Q',
  'RP', 'RT', 'RUBY', 'S', 'SMALL', 'SPAN', 'STRIKE', 'STRONG',
  'SUB', 'SUP', 'TIME', 'TT', 'U', 'WBR',
]);

/** Maximum characters per translation piece before splitting */
export const MAX_PIECE_CHARS = 1000;

/** IntersectionObserver root margin for pre-loading */
export const VIEWPORT_MARGIN = '200px';

/** MutationObserver debounce interval in ms */
export const MUTATION_DEBOUNCE_MS = 500;

/** Data attributes used by the extension */
export const DATA_ATTRS = {
  /** Role marker: 'original' or 'translation' */
  ROLE: 'data-lingua-role',
  /** Page-level translation state */
  STATE: 'data-lingua-state',
  /** Piece ID reference */
  PIECE_ID: 'data-lingua-piece-id',
  /** Marks an element as translated */
  TRANSLATED: 'data-lingua-translated',
} as const;

/** Translation page states */
export type PageState = 'dual' | 'translation-only' | 'off';

/** Extension storage keys */
export const STORAGE_KEYS = {
  SETTINGS: 'lingua-lens-settings',
  CACHE_DB: 'lingua-lens-cache',
  CACHE_STORE: 'translations',
} as const;
