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
]);

/** Inline elements that stay within a translation piece */
export const INLINE_ELEMENTS = new Set([
  'A', 'ABBR', 'ACRONYM', 'B', 'BDI', 'BDO', 'BIG', 'BR',
  'CITE', 'CODE', 'DATA', 'DEL', 'DFN', 'EM', 'FONT', 'I', 'IMG',
  'INS', 'KBD', 'LABEL', 'MARK', 'METER', 'OUTPUT', 'PROGRESS', 'Q',
  'RP', 'RT', 'RUBY', 'S', 'SAMP', 'SMALL', 'SPAN', 'STRIKE', 'STRONG',
  'SUB', 'SUP', 'TIME', 'TT', 'U', 'VAR', 'WBR',
]);

/** Maximum characters per translation piece before splitting */
export const MAX_PIECE_CHARS = 1000;

/**
 * Cue count per LLM translation call (background chunks cues into batches of
 * this size). Shared so the overlay's playback-position priority dedup can
 * compute the same chunk boundaries as the background without drifting.
 */
export const SUBTITLE_CHUNK_SIZE = 25;

/** Pieces at or below this character count use compact inline display (parenthetical)
 *  instead of block-level themed display — prevents space explosion on short content */
export const SHORT_PIECE_THRESHOLD = 80;

/** IntersectionObserver root margin for pre-loading */
export const VIEWPORT_MARGIN = '200px';

/** MutationObserver debounce interval in ms */
export const MUTATION_DEBOUNCE_MS = 500;

// FR-4: Whitelist of body-level tags the walker descends into when
// enableBodyTagWhitelist is ON. Other direct children of <body> (nav, aside,
// header, footer, form, table, …) are skipped entirely. Composable with
// smart-excludes (which still apply within whitelisted containers).
export const BODY_TRANSLATE_TAGS = new Set(['MAIN', 'ARTICLE', 'SECTION', 'DIV']);

// FR-5: Aside-region text caps (constants, not user-configurable in this track).
// Per-paragraph: skip pieces longer than this (ImmersiveTranslate default 67).
export const ASIDE_MAX_TEXT_PER_PARAGRAPH = 67;
// Per-region: stop translating a region once cumulative chars exceed this.
export const ASIDE_MAX_TEXT_PER_REGION = 1000;

/** Data attributes used by the extension */
export const DATA_ATTRS = {
  /** Role marker: 'original' or 'translation' */
  ROLE: 'data-anyllm-role',
  /** Page-level translation state */
  STATE: 'data-anyllm-state',
  /** Piece ID reference */
  PIECE_ID: 'data-anyllm-piece-id',
  /** Marks an element as translated */
  TRANSLATED: 'data-anyllm-translated',
} as const;

/** Translation page states */
export type PageState = 'dual' | 'translation-only' | 'off';

/**
 * PDF viewer view-mode preference:
 * - 'split' (default): original PDF canvas left, translation right (side-by-side).
 * - 'translation-only': full-width reading flow, left pane hidden.
 * - 'bilingual': full-width single column where each paragraph shows the
 *   original text and its translation stacked together (focused reading
 *   without the canvas, like the web-page bilingual-below theme).
 */
export type PdfViewMode = 'split' | 'translation-only' | 'bilingual';

/** Extension storage keys */
export const STORAGE_KEYS = {
  SETTINGS: 'anyllm-translate-settings',
  CACHE_DB: 'anyllm-translate-cache',
  CACHE_STORE: 'translations',
  CONNECTION_STATUS: 'anyllm-connection-status',
  /** Per-install random salt for API key encryption key derivation */
  ENC_SALT: 'anyllm-translate-enc-salt',
  /** PDF viewer view-mode preference: 'split' (default) | 'translation-only' | 'bilingual' */
  PDF_VIEW_MODE: 'anyllm-pdf-view-mode',
  /** PDF viewer translation-progress snapshots, keyed by context hash (url+lang+provider+model). */
  PDF_PROGRESS: 'anyllm-pdf-progress',
} as const;
