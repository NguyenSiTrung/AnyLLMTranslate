/**
 * Rich translate — inline markup preservation (FR-1).
 *
 * Encodes inline HTML elements (`<a>`, `<strong>`, `<code>`, …) as numbered
 * `<z id="N">…</z>` placeholder tokens so the surrounding + inner text can be
 * translated as a flat string by the LLM while the markup boundaries are
 * preserved. On return, {@link decodeInlineHtml} rebuilds a safe
 * `DocumentFragment` with the original (sanitized) elements.
 *
 * XSS safety: decode reconstructs elements via `document.createElement` (never
 * `innerHTML`), drops `<script>`/event-handler attributes/`javascript:` URLs,
 * and falls back to literal text for anything it cannot trust.
 *
 * Mirrors Immersive Translate's `variables` / `richVariables` encode-decode
 * (`aR`/`oR`) approach.
 */

/** Inline element tags whose markup is preserved by rich translate. */
export const INLINE_ELEMENTS = [
  'A',
  'B',
  'STRONG',
  'I',
  'EM',
  'CODE',
  'SPAN',
  'MARK',
  'SUB',
  'SUP',
  'U',
  'S',
  'SMALL',
  'KBD',
  'Q',
  'CITE',
  'ABBR',
  'TIME',
  'DEL',
  'INS',
  'FONT',
] as const;

const INLINE_SET: ReadonlySet<string> = new Set(INLINE_ELEMENTS);

/** Case-insensitive membership test against the inline whitelist. */
export function isInlineTagName(tag: string): boolean {
  return INLINE_SET.has(tag.toUpperCase());
}

/** A reconstructed inline element waiting to be re-inserted on decode. */
export interface RichVariable {
  /** Placeholder id matching the `<z id="N">` token. */
  id: number;
  /** Upper-case tag name (e.g. `A`, `STRONG`). */
  tag: string;
  /** Original opening-tag markup, e.g. `<a href="…" class="…">`. */
  openHtml: string;
  /** Original closing-tag markup, e.g. `</a>`. */
  closeHtml: string;
}

export interface EncodeResult {
  /** Flat text with `<z id="N">…</z>` tokens in place of inline elements. */
  flatText: string;
  /** Original inline elements keyed by placeholder id. */
  variables: RichVariable[];
}

/** Void/self-closing HTML elements that never get a closing tag. */
const VOID_ELEMENTS = new Set([
  'AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META',
  'PARAM', 'SOURCE', 'TRACK', 'WBR',
]);

const TAG_RE = /<(\/)?([a-zA-Z][a-zA-Z0-9-]*)((?:[^<>]|"[^"]*"|'[^']*')*)>/g;

/**
 * Encode inline HTML elements as numbered placeholders. Non-inline and void
 * elements are left verbatim in the flat text. Nested inline elements are
 * encoded outer-first (the outer wrapper gets the lower id).
 */
export function encodeInlineHtml(html: string): EncodeResult {
  const variables: RichVariable[] = [];
  if (!html) return { flatText: '', variables };

  let out = '';
  let last = 0;
  /** Stack of open inline placeholder ids awaiting their closing tag. */
  const openStack: number[] = [];
  let nextId = 0;

  for (const match of html.matchAll(TAG_RE)) {
    const [whole, slash, tagRaw, attrs] = match;
    const tag = tagRaw.toUpperCase();
    const index = (match.index ?? 0);

    // Append the text preceding this tag verbatim.
    out += html.slice(last, index);
    last = index + whole.length;

    const isInline = INLINE_SET.has(tag);
    const isVoid = VOID_ELEMENTS.has(tag);
    const selfClosing = attrs.trimEnd().endsWith('/');

    if (!isInline || isVoid || selfClosing) {
      // Leave non-inline / void / self-closing tags as-is (no placeholder).
      out += whole;
      continue;
    }

    if (!slash) {
      // Opening inline tag → push a placeholder.
      const id = nextId++;
      variables.push({ id, tag, openHtml: whole, closeHtml: `</${tagRaw.toLowerCase()}>` });
      openStack.push(id);
      out += `<z id="${id}">`;
    } else {
      // Closing inline tag → pop the matching placeholder.
      // Find the nearest open placeholder of the same tag (tolerant nesting).
      let poppedId: number | undefined;
      for (let i = openStack.length - 1; i >= 0; i--) {
        if (variables[openStack[i]]?.tag === tag) {
          poppedId = openStack[i];
          openStack.splice(i, 1);
          break;
        }
      }
      if (poppedId === undefined) {
        // Stray closing tag with no opener — emit verbatim.
        out += whole;
      } else {
        out += '</z>';
      }
    }
  }
  // Trailing text.
  out += html.slice(last);

  // Sort variables by id for stable decode lookup.
  variables.sort((a, b) => a.id - b.id);
  return { flatText: out, variables };
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

/** Attributes that are always stripped (event handlers + style). */
const BLOCKED_ATTR_RE = /^on/i;
/** URL-bearing attributes whose `javascript:`/`data:` payloads must be dropped. */
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction']);
/** Tag names that are never reconstructed (XSS / nuisance). */
const BLOCKED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META']);

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;

interface ParsedTag {
  tag: string;
  attrs: Map<string, string>;
}

function parseOpenTag(openHtml: string): ParsedTag | null {
  const m = openHtml.match(/^<([a-zA-Z][a-zA-Z0-9-]*)((?:[^<>]|"[^"]*"|'[^']*')*)>$/);
  if (!m) return null;
  const tag = m[1].toUpperCase();
  const attrs = new Map<string, string>();
  for (const am of m[2].matchAll(ATTR_RE)) {
    const name = am[1].toLowerCase();
    const value = am[2] ?? am[3] ?? am[4] ?? '';
    attrs.set(name, value);
  }
  return { tag, attrs };
}

function isSafeUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return true; // empty href is harmless
  // Allow relative, anchor, protocol-relative, http(s), mailto, tel, ftp.
  if (v.startsWith('#') || v.startsWith('/') || v.startsWith('?')) return true;
  if (/^[a-z][a-z0-9+.-]*:/.test(v)) {
    return /^(https?|mailto|tel|ftp):/i.test(v);
  }
  return true; // protocol-relative or bare text
}

/** Build a sanitized element from a variable; returns null if it must be dropped. */
function buildSanitizedElement(variable: RichVariable): Element | null {
  const parsed = parseOpenTag(variable.openHtml);
  if (!parsed) return null;
  const { tag, attrs } = parsed;
  if (BLOCKED_TAGS.has(tag)) return null;

  let el: Element;
  try {
    el = document.createElement(tag.toLowerCase());
  } catch {
    return null;
  }
  for (const [name, value] of attrs) {
    if (BLOCKED_ATTR_RE.test(name)) continue; // on* handlers
    if (name === 'style') continue;
    if (URL_ATTRS.has(name) && !isSafeUrl(value)) continue;
    try {
      el.setAttribute(name, value);
    } catch {
      /* ignore invalid attribute names */
    }
  }
  return el;
}

/**
 * Rebuild a safe `DocumentFragment` from translated flat text + the variables
 * produced by {@link encodeInlineHtml}. Text nodes are appended verbatim
 * (never parsed as HTML); elements are reconstructed via `createElement`.
 */
export function decodeInlineHtml(translated: string, variables: RichVariable[]): DocumentFragment {
  const frag = document.createDocumentFragment();
  if (!translated) return frag;

  const byId = new Map<number, RichVariable>();
  for (const v of variables) byId.set(v.id, v);

  appendRun(frag, translated, 0, translated.length, byId);

  return frag;
}

/**
 * Append a slice of `text` (between [start,end)) to `parent`, expanding any
 * `<z id="N">…</z>` placeholder into a sanitized element whose children are
 * filled by a recursive call on the inner span.
 *
 * Returns the index in `text` immediately after the consumed slice.
 */
function appendRun(
  parent: Node,
  text: string,
  start: number,
  end: number,
  byId: Map<number, RichVariable>,
): number {
  let i = start;
  let textStart = start;

  const flushText = (upto: number): void => {
    if (upto > textStart) {
      parent.appendChild(document.createTextNode(text.slice(textStart, upto)));
    }
    textStart = upto;
  };

  while (i < end) {
    const openMatch = matchPlaceholderAt(text, i, end);
    if (openMatch) {
      const { id, afterOpen } = openMatch;
      flushText(i);
      // Find the matching close `</z>`, accounting for nested `<z id="…">`.
      const closeIdx = findMatchingClose(text, afterOpen, end);
      const innerEnd = closeIdx === -1 ? end : closeIdx;
      const variable = byId.get(id);
      if (variable) {
        const el = buildSanitizedElement(variable);
        if (el) {
          // Recurse to fill the element's children, then append it.
          appendRun(el, text, afterOpen, innerEnd, byId);
          parent.appendChild(el);
        } else {
          // Dropped/blocked element: render inner text only (no element).
          appendRun(parent, text, afterOpen, innerEnd, byId);
        }
      } else {
        // Unknown placeholder id: render the inner text literally.
        appendRun(parent, text, afterOpen, innerEnd, byId);
      }
      // Advance past `</z>` if found, else to end.
      if (closeIdx === -1) {
        return end;
      }
      i = closeIdx + '</z>'.length;
      textStart = i;
    } else {
      i++;
    }
  }
  flushText(end);
  return end;
}

interface OpenHit {
  id: number;
  afterOpen: number;
}

/** If `text[pos]` begins a `<z id="N">` token, return its parsed id + end index. */
function matchPlaceholderAt(text: string, pos: number, end: number): OpenHit | null {
  if (text[pos] !== '<') return null;
  // Manual scan to avoid global-regex statefulness and respect bounds.
  const tag = '<z id="';
  if (text.slice(pos, pos + tag.length) !== tag) return null;
  let j = pos + tag.length;
  let digits = '';
  while (j < end && text[j] >= '0' && text[j] <= '9') {
    digits += text[j];
    j++;
  }
  if (!digits) return null;
  if (text[j] !== '"') return null;
  j++;
  if (text[j] !== '>') return null;
  j++;
  const id = Number(digits);
  if (!Number.isFinite(id)) return null;
  return { id, afterOpen: j };
}

/** Find the index of the `</z>` that closes the placeholder opened at `afterOpen`. */
function findMatchingClose(text: string, afterOpen: number, end: number): number {
  let depth = 1;
  let i = afterOpen;
  while (i < end) {
    if (text[i] === '<') {
      const open = matchPlaceholderAt(text, i, end);
      if (open) {
        depth++;
        i = open.afterOpen;
        continue;
      }
      if (text.slice(i, i + 4) === '</z>') {
        depth--;
        if (depth === 0) return i;
        i += 4;
        continue;
      }
    }
    i++;
  }
  return -1;
}
