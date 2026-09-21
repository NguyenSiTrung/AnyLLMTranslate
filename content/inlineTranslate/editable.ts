/**
 * Editable-element guards and deep active-element resolution.
 */

/** Input types treated as text-editable (excludes password, button, etc.) */
const EDITABLE_INPUT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel']);

/**
 * Whether an element is an editable field we may translate.
 * Excludes password, readOnly, and disabled controls.
 */
export function isEditableElement(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;

  // Our own interactive UI (copy-panel textarea, scratch fields) must never
  // become a translate target — typing there feeds the gesture detector.
  // (data-anyllm-role is NOT usable here: page translation stamps it on
  // original/translated content nodes.)
  if (el.closest('[data-anyllm-ui]')) return false;

  // contentEditable (property + attribute for jsdom)
  if (el.isContentEditable || el.contentEditable === 'true') {
    // contentEditable with aria-readonly
    if (el.getAttribute('aria-readonly') === 'true') return false;
    return true;
  }

  if (el instanceof HTMLTextAreaElement) {
    return !el.readOnly && !el.disabled;
  }

  if (el instanceof HTMLInputElement) {
    if (el.readOnly || el.disabled) return false;
    if (el.type === 'password') return false;
    return EDITABLE_INPUT_TYPES.has(el.type);
  }

  return false;
}

/** Password field check (redundant with isEditableElement but useful standalone) */
export function isPasswordField(el: Element): boolean {
  return el instanceof HTMLInputElement && el.type === 'password';
}

/**
 * Whether the element is inside a *code IDE* editor (Monaco, CodeMirror, Ace).
 *
 * Intentionally does NOT treat general rich-text / chat composers as code
 * editors — ProseMirror, Quill, and role=textbox+aria-multiline are used by
 * ChatGPT, Claude, Discord, X/Twitter, etc. Blocking those made Space×N
 * inline translate appear completely broken on the sites users care about.
 *
 * True code surfaces are identified by IDE class names or explicit language
 * mode markers (data-mode-id / data-language / data-testid=code-editor).
 */
export function isCodeEditor(el: Element): boolean {
  // Real code IDEs only — not ProseMirror / Quill chat composers.
  const editorClasses = [
    'monaco-editor',
    'CodeMirror',
    'ace_editor',
    'cm-editor',
    'cm-content',
    'ace_text-input',
  ];

  let current: Element | null = el;
  while (current) {
    if (current.classList) {
      for (const cls of editorClasses) {
        if (current.classList.contains(cls)) return true;
      }
    }
    // Explicit language/mode markers (Monaco and similar) — not bare
    // role=textbox + aria-multiline, which chat UIs also use.
    if (
      current.hasAttribute('data-mode-id') ||
      current.hasAttribute('data-language') ||
      current.getAttribute('data-testid') === 'code-editor'
    ) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * Resolve the deep active element: walk shadow roots, same-origin iframes,
 * and contentEditable caret parents when enabled.
 *
 * jsdom limits: shadowRoot activeElement and cross-frame access are limited;
 * production browsers resolve correctly.
 */
export function getDeepActiveElement(
  doc: Document = document,
  enableDeep = true,
): Element | null {
  let active: Element | null = doc.activeElement;
  if (!active || !enableDeep) return active;

  // Walk open shadow roots
  const seen = new Set<Element>();
  while (active && active.shadowRoot?.activeElement) {
    if (seen.has(active)) break;
    seen.add(active);
    active = active.shadowRoot.activeElement;
  }

  // Same-origin iframe
  if (active instanceof HTMLIFrameElement) {
    try {
      const iframeDoc = active.contentDocument;
      if (iframeDoc?.activeElement) {
        return getDeepActiveElement(iframeDoc, enableDeep);
      }
    } catch {
      // Cross-origin — cannot access
    }
  }

  // contentEditable caret: if selection is inside a CE host, prefer that host
  try {
    const sel = (active?.ownerDocument ?? doc).getSelection?.();
    if (sel && sel.rangeCount > 0) {
      const node = sel.anchorNode;
      if (node) {
        const el =
          node.nodeType === Node.ELEMENT_NODE
            ? (node as Element)
            : node.parentElement;
        if (el) {
          const ceHost = el.closest?.('[contenteditable="true"]');
          if (ceHost instanceof HTMLElement) {
            return ceHost;
          }
        }
      }
    }
  } catch {
    // ignore selection errors
  }

  return active;
}

/**
 * Walk up from a key/input event target to the editable host we should
 * translate (input, textarea, or contentEditable root).
 *
 * Needed because ProseMirror/Quill keydowns often target a nested node
 * (`<p>`, text wrapper) rather than the contentEditable host itself.
 */
export function resolveEditableHost(el: Element | null): HTMLElement | null {
  let current: Element | null = el;
  while (current) {
    if (isEditableElement(current)) {
      // Prefer the outermost contentEditable host when nested CE nodes exist
      if (current instanceof HTMLElement && (current.isContentEditable || current.contentEditable === 'true')) {
        const host = current.closest?.('[contenteditable="true"]');
        if (host instanceof HTMLElement && isEditableElement(host)) {
          return host;
        }
      }
      return current;
    }
    // Shadow boundary: climb to host
    const root = current.getRootNode?.();
    if (root instanceof ShadowRoot && root.host) {
      current = root.host;
      continue;
    }
    current = current.parentElement;
  }
  return null;
}

/** Get plain text from an editable element */
export function getElementText(el: HTMLElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  return readContentEditableText(el);
}

/** Block-level tags that terminate a visual line inside a contentEditable. */
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS', 'DIV', 'DL', 'DT',
  'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4',
  'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION',
  'SUMMARY', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
]);

/**
 * Placeholder / decoration nodes that editors render *inside* the editable.
 * Their text is not part of the draft (Slate renders its placeholder as a real
 * span with text; reading it made an empty composer look non-empty).
 */
const PLACEHOLDER_SELECTOR = [
  '[data-slate-placeholder]',
  '[data-lexical-placeholder]',
  '[data-placeholder]',
  '[data-anyllm-skip]',
  '.slate-placeholder',
  '.ProseMirror-placeholder',
  '.ql-placeholder',
].join(',');

/** Whether a descendant node is editor chrome (placeholder, decoration) we must ignore. */
export function isPlaceholderNode(el: Element): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return true;
  return el.matches(PLACEHOLDER_SELECTOR);
}

/**
 * Read contentEditable content as the user sees it: one line per block,
 * `alt` text for images, newlines for `<br>`, placeholders skipped.
 *
 * `textContent` glues `<p>a</p><p>b</p>` into `"ab"`, which silently corrupted
 * every multi-line draft sent for translation and every write-back check.
 */
export function readContentEditableText(root: Node): string {
  let out = '';

  const walk = (node: Node, isRoot: boolean): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? '';
      return;
    }
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      for (const child of Array.from(node.childNodes)) walk(child, false);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    // The root itself may carry a data-placeholder attribute for CSS ::before.
    if (!isRoot && isPlaceholderNode(el)) return;

    const tag = el.tagName;
    if (tag === 'BR') {
      out += '\n';
      return;
    }
    if (tag === 'IMG') {
      const alt = el.getAttribute('alt');
      if (alt) out += alt;
      return;
    }

    const block = BLOCK_TAGS.has(tag);
    if (block) out += '\n';
    for (const child of Array.from(el.childNodes)) walk(child, false);
    if (block) out += '\n';
  };

  walk(root, true);

  return out
    .replace(/\u00a0/g, ' ')
    // Blocks each contribute a boundary newline; adjacent blocks would
    // otherwise double it. Runs collapse so a read is stable and comparable.
    .replace(/\n{2,}/g, '\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

/** Whether a node subtree carries draft text (used for caret-at-end checks). */
function hasDraftText(node: Node): boolean {
  return readContentEditableText(node).trim().length > 0;
}

/**
 * Whether the caret is at the end of the field (for trailing-trigger gestures).
 * contentEditable uses selection; returns true when selection APIs unavailable
 * (fail-open so gesture still works in limited environments).
 *
 * If the live selection is outside `el` (common in jsdom after focus moves, or
 * when keydown targets a nested node while selection lags), fail open — a
 * false "mid-string" would silently kill Space×N on every chat composer.
 */
export function isCaretAtEnd(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const pos = el.selectionStart;
    if (pos == null) return true;
    return pos === el.value.length;
  }
  try {
    const sel = el.ownerDocument.getSelection();
    if (!sel || sel.rangeCount === 0) return true;
    const range = sel.getRangeAt(0);
    // Selection not inside this editable host → cannot judge; fail open
    const anchor = range.commonAncestorContainer;
    const anchorEl =
      anchor.nodeType === Node.ELEMENT_NODE
        ? (anchor as Element)
        : anchor.parentElement;
    if (!anchorEl || !el.contains(anchorEl)) {
      return true;
    }
    if (!range.collapsed) return false;
    // Block-aware "nothing meaningful after the caret" — comparing raw string
    // lengths broke on multi-paragraph drafts once reads started inserting
    // newlines at block boundaries.
    const after = el.ownerDocument.createRange();
    after.setStart(range.endContainer, range.endOffset);
    after.setEndAfter(el);
    return !hasDraftText(after.cloneContents());
  } catch {
    return true;
  }
}

/**
 * Whether focus currently sits on (or inside) `el`.
 * Used to refuse write-backs that would steal focus from wherever the user
 * moved on to while the translation was in flight.
 */
export function isFocusedWithin(el: HTMLElement): boolean {
  try {
    const doc = el.ownerDocument;
    const active = getDeepActiveElement(doc, true);
    if (!active) return false;
    if (active === el || el.contains(active)) return true;
    // Selection inside the element also counts (some editors focus a child).
    const sel = doc.getSelection?.();
    if (sel && sel.rangeCount > 0) {
      const anchor = sel.anchorNode;
      const anchorEl = anchor?.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor?.parentElement;
      if (anchorEl && (anchorEl === el || el.contains(anchorEl))) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Editors that own their DOM (ProseMirror, Lexical, Slate, Draft.js, Quill).
 *
 * Measured in Chrome 153: ProseMirror reverts or ignores every DOM-level write
 * (native `execCommand`, synthetic `beforeinput`/`input`, manual DOM inserts,
 * `innerHTML`) and Lexical duplicates text when both `beforeinput` and `input`
 * are dispatched. Writing to these composers corrupts or desyncs the draft, so
 * inline translate refuses to touch them and hands the translation to the user
 * instead.
 */
const FRAMEWORK_OWNED_SELECTOR = [
  '.ProseMirror',
  '[data-lexical-editor]',
  '[data-lexical-text]',
  '[data-slate-editor]',
  '[data-slate-node]',
  '[data-slate-void]',
  '[data-block="true"]',
  '[data-contents="true"]',
  '.ql-editor',
].join(',');

export function isFrameworkOwnedEditor(el: HTMLElement): boolean {
  if (el.matches(FRAMEWORK_OWNED_SELECTOR)) return true;
  return el.querySelector(FRAMEWORK_OWNED_SELECTOR) !== null;
}

/** Whether the element is still connected and editable for write-back */
export function isStillWritable(el: HTMLElement): boolean {
  return el.isConnected && isEditableElement(el) && !isPasswordField(el) && !isCodeEditor(el);
}
