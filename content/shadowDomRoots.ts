/**
 * Shadow DOM roots — session-scoped registry of open shadow roots (FR-23).
 * Extraction, display cleanup, and mutation watching share this registry so
 * every open root gets exactly one injected stylesheet and watchers can
 * observe roots discovered before they started. Closed roots are naturally
 * unsupported: `element.shadowRoot` is null for them.
 */

import injectCssText from '@/styles/inject.css?inline';
import { DATA_ATTRS } from '@/lib/constants';

/** Marker attribute on the single <style> injected per registered root. */
const SHADOW_STYLE_ATTR = 'data-anyllm-shadow-style';

/** Attributes that live on <html> and gate the translation styles. */
const DOCUMENT_SCOPE_ATTRS = ['data-anyllm-theme', 'data-anyllm-state', 'data-anyllm-position'];
/** Class applied to <html> for forced dark mode. */
const DOCUMENT_SCOPE_CLASS = 'anyllm-dark';

const registeredRoots = new Set<ShadowRoot>();
let scopedCssCache: string | null = null;

/** Recursively collect every open shadow root under (and on) `scope`. */
export function collectOpenShadowRoots(scope: ParentNode): ShadowRoot[] {
  const roots: ShadowRoot[] = [];
  const visit = (el: Element): void => {
    // Extension-owned UI (player chrome, …) is never registered — traversal
    // stops at the owned host so nested roots stay uncollected too.
    if (el.hasAttribute(DATA_ATTRS.OWNED)) return;
    const shadow = el.shadowRoot;
    if (!shadow) return;
    roots.push(shadow);
    for (const child of shadow.querySelectorAll('*')) {
      visit(child);
    }
  };
  if (scope instanceof Element) {
    visit(scope);
  }
  if (typeof scope.querySelectorAll === 'function') {
    for (const el of scope.querySelectorAll('*')) {
      visit(el);
    }
  }
  return roots;
}

function shadowScopedCss(): string {
  if (scopedCssCache === null) {
    scopedCssCache = scopeCssForShadowRoot(injectCssText);
  }
  return scopedCssCache;
}

/** Inject the scoped theme stylesheet into a root — at most once per root. */
function injectShadowStyle(root: ShadowRoot): void {
  if (root.querySelector(`style[${SHADOW_STYLE_ATTR}]`)) return;
  const style = document.createElement('style');
  style.setAttribute(SHADOW_STYLE_ATTR, '');
  style.textContent = shadowScopedCss();
  root.appendChild(style);
}

/**
 * Mirror the document's translation state (theme/state/position attrs and
 * .anyllm-dark) onto each registered root's host element. The scoped
 * stylesheet uses :host(...) — Firefox does not support :host-context() —
 * so the host itself must carry the state selectors.
 */
export function syncShadowHostState(root?: ShadowRoot): void {
  if (typeof document === 'undefined') return;
  const docEl = document.documentElement;
  const roots = root ? [root] : [...registeredRoots];
  for (const r of roots) {
    const host = r.host;
    if (!(host instanceof HTMLElement)) continue;
    for (const attr of DOCUMENT_SCOPE_ATTRS) {
      const value = docEl.getAttribute(attr);
      if (value === null) host.removeAttribute(attr);
      else host.setAttribute(attr, value);
    }
    host.classList.toggle(DOCUMENT_SCOPE_CLASS, docEl.classList.contains(DOCUMENT_SCOPE_CLASS));
  }
}

/**
 * Discover open shadow roots under `scope`, register the new ones, and inject
 * the scoped stylesheet. Returns every open root in the scope — including
 * roots registered earlier — so callers can observe the full set.
 */
export function registerShadowRoots(scope: ParentNode): ShadowRoot[] {
  const roots = collectOpenShadowRoots(scope);
  for (const root of roots) {
    registeredRoots.add(root);
    injectShadowStyle(root);
    syncShadowHostState(root);
  }
  return roots;
}

/** All open shadow roots registered this session. */
export function getRegisteredShadowRoots(): ShadowRoot[] {
  return [...registeredRoots];
}

/** Session reset — removes injected styles and forgets every root. */
export function clearShadowDomRoots(): void {
  for (const root of registeredRoots) {
    for (const style of root.querySelectorAll(`style[${SHADOW_STYLE_ATTR}]`)) {
      style.remove();
    }
    // Strip the mirrored host state so teardown leaves page hosts untouched.
    const host = root.host;
    if (host instanceof HTMLElement) {
      for (const attr of DOCUMENT_SCOPE_ATTRS) host.removeAttribute(attr);
      host.classList.remove(DOCUMENT_SCOPE_CLASS);
    }
  }
  registeredRoots.clear();
}

/* ===== Selector scoping adapter =====
 * Document-root selectors (html[data-anyllm-state], [data-anyllm-theme],
 * html.anyllm-dark, …) cannot match inside a shadow tree. They are rewritten
 * to :host(...) — Firefox does not support :host-context() — so the host
 * element itself must carry the state. syncShadowHostState mirrors the
 * document's data-anyllm-* attributes / .anyllm-dark onto every registered
 * host, keeping the mirrored state namespaced to AnyLLM keys only. */

/** Split a top-level selector list on commas outside brackets/parens/strings. */
function splitSelectorList(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/** Split a compound selector (no combinators) into simple-selector strings. */
function splitCompound(compound: string): string[] {
  const parts: string[] = [];
  let i = 0;
  while (i < compound.length) {
    const start = i;
    const ch = compound[i];
    if (ch === '[') {
      // Attribute selector — skip to the closing bracket, honoring quotes.
      i++;
      let quote: string | null = null;
      while (i < compound.length) {
        const c = compound[i];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === ']') {
          i++;
          break;
        }
        i++;
      }
    } else if (ch === ':') {
      // Pseudo-class / pseudo-element — name plus optional balanced args.
      i++;
      if (compound[i] === ':') i++;
      while (i < compound.length && /[a-zA-Z0-9-]/.test(compound[i])) i++;
      if (compound[i] === '(') {
        let depth = 0;
        let quote: string | null = null;
        while (i < compound.length) {
          const c = compound[i];
          if (quote) {
            if (c === quote) quote = null;
            i++;
            continue;
          }
          if (c === '"' || c === "'") {
            quote = c;
            i++;
            continue;
          }
          if (c === '(') depth++;
          else if (c === ')') {
            depth--;
            i++;
            if (depth === 0) break;
            continue;
          }
          i++;
        }
      }
    } else {
      // Type selector, class, id, or universal.
      i++;
      while (i < compound.length && /[a-zA-Z0-9_-]/.test(compound[i])) i++;
    }
    parts.push(compound.slice(start, i));
  }
  return parts;
}

/** Attribute name of a simple attribute selector like `[data-x="y"]`. */
function attrNameOf(simple: string): string {
  const inner = simple.slice(1, simple.endsWith(']') ? -1 : undefined);
  const match = inner.match(/^[a-zA-Z0-9_-]+/);
  return match?.[0] ?? '';
}

/** Simple selectors that may only appear on the document element. */
function isDocumentScopeAnchor(simple: string): boolean {
  if (simple === 'html') return true;
  if (simple === `.${DOCUMENT_SCOPE_CLASS}`) return true;
  if (simple.startsWith('[')) {
    return DOCUMENT_SCOPE_ATTRS.includes(attrNameOf(simple));
  }
  return false;
}

/** Simple selectors allowed inside a document-scope compound. */
function isDocumentScopeSimple(simple: string): boolean {
  if (simple === '*') return true;
  if (simple.startsWith(':')) return true; // pseudo-classes qualify the host (<html>)
  return isDocumentScopeAnchor(simple);
}

/** A compound is document-scoped when every simple selector targets <html>
 *  state (html tag, data-anyllm-* page attributes, .anyllm-dark) or is a
 *  neutral pseudo-class, and at least one of them is a real anchor. */
function isDocumentScopeCompound(compound: string): boolean {
  const simples = splitCompound(compound.trim());
  if (simples.length === 0) return false;
  let anchored = false;
  for (const simple of simples) {
    if (!isDocumentScopeSimple(simple)) return false;
    if (isDocumentScopeAnchor(simple)) anchored = true;
  }
  return anchored;
}

/** Type selectors (`html`, `div`, `*` …) — dropped from :host(...) args since
 *  the host element itself is implied, and used to guard compound merging. */
function isTypeSelector(simple: string): boolean {
  return /^[a-zA-Z|*]/.test(simple);
}

/** Rewrite one selector: merge leading document-scope compounds into a single
 *  :host(...) and keep the remaining (in-shadow) selector chain. */
function scopeSelector(selector: string): string {
  let rest = selector.trimStart();
  const stripped: string[] = [];
  let strippedHasType = false;

  for (;;) {
    // Read the next compound: up to a top-level combinator.
    let i = 0;
    let depth = 0;
    let quote: string | null = null;
    while (i < rest.length) {
      const ch = rest[i];
      if (quote) {
        if (ch === quote) quote = null;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        i++;
        continue;
      }
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      else if (depth === 0 && /[\s>+~]/.test(ch)) break;
      i++;
    }
    const compound = rest.slice(0, i);
    if (!compound.trim() || !isDocumentScopeCompound(compound)) break;

    // A compound may carry at most one type selector — merging a second
    // document-scope compound containing `html` would be malformed (and the
    // trailing `html` can never match inside a shadow tree anyway). Scope
    // only the valid leading compound and leave the rest of the chain alone.
    const compoundHasType = splitCompound(compound.trim()).some(isTypeSelector);
    if (compoundHasType && strippedHasType) break;

    stripped.push(compound.trim());
    strippedHasType = strippedHasType || compoundHasType;
    // Merge across descendant / child combinators only — `+`/`~` keep their
    // combinator in the output (they never appear between document-state
    // compounds in practice).
    let j = i;
    while (j < rest.length && /\s/.test(rest[j])) j++;
    if (rest[j] === '>') {
      j++;
      while (j < rest.length && /\s/.test(rest[j])) j++;
    } else if (rest[j] === '+' || rest[j] === '~') {
      rest = rest.slice(i);
      break;
    }
    rest = rest.slice(j);
  }

  if (stripped.length === 0) return selector;

  // :host() already implies the host element — drop type/universal selectors
  // (`html`, `*`) and keep the mirrored attributes / classes / pseudo-classes.
  const hostArg = stripped
    .flatMap((compound) => splitCompound(compound))
    .filter((simple) => !isTypeSelector(simple))
    .join('');
  const hostPart = hostArg ? `:host(${hostArg})` : ':host';
  return rest ? `${hostPart} ${rest}` : hostPart;
}

/** Transform a selector list segment (no comments) member-wise. */
function scopeSelectorList(listText: string): string {
  if (!listText.trim()) return listText;
  return splitSelectorList(listText)
    .map((part) => (part.trim() ? scopeSelector(part) : part))
    .join(',');
}

/** Rewrite the selector prelude of a style rule, preserving comments. */
function scopeStylePrelude(prelude: string): string {
  let out = '';
  let rest = prelude;
  for (;;) {
    const commentStart = rest.indexOf('/*');
    if (commentStart === -1) {
      out += scopeSelectorList(rest);
      break;
    }
    out += scopeSelectorList(rest.slice(0, commentStart));
    const commentEnd = rest.indexOf('*/', commentStart + 2);
    const stop = commentEnd === -1 ? rest.length : commentEnd + 2;
    out += rest.slice(commentStart, stop);
    rest = rest.slice(stop);
  }
  return out;
}

/** Index of the next `{` outside comments and strings, or -1. */
function findNextBrace(css: string, from: number): number {
  let quote: string | null = null;
  for (let i = from; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 1;
      continue;
    }
    if (ch === '{') return i;
  }
  return -1;
}

/** Index of the `}` matching the `{` at `open`, or -1. */
function findMatchingBrace(css: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 1;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Rewrite document-level translation CSS for use inside a shadow root.
 * Style-rule selectors get :host(...) scoping; @media/@supports blocks are
 * recursed into; @keyframes and declaration bodies stay verbatim.
 */
export function scopeCssForShadowRoot(cssText: string): string {
  let out = '';
  let i = 0;
  while (i < cssText.length) {
    const brace = findNextBrace(cssText, i);
    if (brace === -1) {
      out += cssText.slice(i);
      break;
    }
    const prelude = cssText.slice(i, brace);
    // Classify the prelude by its first non-comment, non-whitespace token —
    // a comment before `@media` must not turn the at-rule into a style rule.
    let preludeBody = prelude;
    for (;;) {
      preludeBody = preludeBody.trimStart();
      if (!preludeBody.startsWith('/*')) break;
      const commentEnd = preludeBody.indexOf('*/', 2);
      if (commentEnd === -1) break;
      preludeBody = preludeBody.slice(commentEnd + 2);
    }
    const trimmed = preludeBody.trim();
    const atName = trimmed.startsWith('@')
      ? (trimmed.match(/^@([a-zA-Z-]+)/)?.[1]?.toLowerCase() ?? '')
      : '';
    if (atName) {
      const end = findMatchingBrace(cssText, brace);
      if (end === -1) {
        out += cssText.slice(i);
        break;
      }
      if (atName === 'media' || atName === 'supports' || atName === 'layer' || atName === 'container') {
        out += prelude + '{' + scopeCssForShadowRoot(cssText.slice(brace + 1, end)) + '}';
      } else {
        // @keyframes, @font-face, etc. — copy the whole block verbatim.
        out += cssText.slice(i, end + 1);
      }
      i = end + 1;
      continue;
    }
    const end = findMatchingBrace(cssText, brace);
    if (end === -1) {
      out += cssText.slice(i);
      break;
    }
    out += scopeStylePrelude(prelude) + cssText.slice(brace, end + 1);
    i = end + 1;
  }
  return out;
}
