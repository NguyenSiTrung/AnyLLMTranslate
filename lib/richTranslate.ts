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

/** Escape an attribute value for a double-quoted `openHtml` attribute. */
function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** Serialize an element's opening tag (attributes escaped, double-quoted). */
function serializeOpenTag(el: Element): string {
  let attrs = '';
  for (const attr of Array.from(el.attributes)) {
    attrs += ` ${attr.name}="${escapeAttr(attr.value)}"`;
  }
  return `<${el.tagName.toLowerCase()}${attrs}>`;
}

/** Whitelisted inline ancestors of `node` below `anchor`, outermost first. */
function inlineChain(node: Node, anchor: Element): Element[] {
  const chain: Element[] = [];
  for (let el = node.parentElement; el && el !== anchor; el = el.parentElement) {
    if (INLINE_SET.has(el.tagName)) chain.push(el);
  }
  return chain.reverse();
}

/**
 * Encode one piece group: the group's own text nodes plus their whitelisted
 * inline ancestors up to `anchor`, as `<z id="N">…</z>` placeholders (FR-1).
 * Block descendants, walker-rejected subtrees and comments are never in
 * `textNodes`, so they cannot leak into the LLM text. Text comes from
 * `Text.data`, so characters stay decoded (`&`, not `&amp;`) (FR-2), and
 * `separator` supplies the `\n` for `<br>` between adjacent nodes. Nested
 * inline elements are encoded outer-first (the outer wrapper gets the lower id).
 */
export function encodeInlineNodes(
  textNodes: readonly Text[],
  anchor: Element,
  separator: (prev: Text, next: Text) => string = () => '',
): EncodeResult {
  const variables: RichVariable[] = [];
  const ids = new Map<Element, number>();
  let open: Element[] = [];
  let out = '';

  textNodes.forEach((node, index) => {
    const chain = inlineChain(node, anchor);
    let shared = 0;
    while (shared < open.length && shared < chain.length && open[shared] === chain[shared]) shared++;
    out += '</z>'.repeat(open.length - shared);
    if (index > 0) out += separator(textNodes[index - 1], node);
    for (const el of chain.slice(shared)) {
      let id = ids.get(el);
      if (id === undefined) {
        id = variables.length;
        ids.set(el, id);
        const tag = el.tagName.toUpperCase();
        variables.push({ id, tag, openHtml: serializeOpenTag(el), closeHtml: `</${tag.toLowerCase()}>` });
      }
      out += `<z id="${id}">`;
    }
    open = chain;
    out += node.data;
  });
  out += '</z>'.repeat(open.length);

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

const NAMED_ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };

/**
 * FR-2: decode the character references an attribute value can carry in
 * `openHtml` (ours escape `&` and `"`; page markup may use more), so
 * `setAttribute` receives `a=1&b=2`, not the literal `a=1&amp;b=2`.
 */
function decodeAttrEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] !== '#') return NAMED_ENTITIES[ref.toLowerCase()] ?? whole;
    const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

function parseOpenTag(openHtml: string): ParsedTag | null {
  const m = openHtml.match(/^<([a-zA-Z][a-zA-Z0-9-]*)((?:[^<>]|"[^"]*"|'[^']*')*)>$/);
  if (!m) return null;
  const tag = m[1].toUpperCase();
  const attrs = new Map<string, string>();
  for (const am of m[2].matchAll(ATTR_RE)) {
    const name = am[1].toLowerCase();
    const value = decodeAttrEntities(am[2] ?? am[3] ?? am[4] ?? '');
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
 * produced by {@link encodeInlineNodes}. Text nodes are appended verbatim
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
