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

/** Whether the element is inside a code editor (Monaco, CodeMirror, Ace, …) */
export function isCodeEditor(el: Element): boolean {
  const editorClasses = [
    'monaco-editor',
    'CodeMirror',
    'ace_editor',
    'cm-editor',
    'cm-content',
    'ace_text-input',
    'ql-editor', // Quill
    'ProseMirror',
  ];

  let current: Element | null = el;
  while (current) {
    if (current.classList) {
      for (const cls of editorClasses) {
        if (current.classList.contains(cls)) return true;
      }
    }
    if (
      current.getAttribute('role') === 'textbox' &&
      (current.getAttribute('aria-multiline') === 'true' ||
        current.getAttribute('data-mode-id') != null ||
        current.getAttribute('data-language') != null)
    ) {
      return true;
    }
    // data-gramm / code-editor markers
    if (
      current.hasAttribute('data-mode-id') ||
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

/** Get plain text from an editable element */
export function getElementText(el: HTMLElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  return el.textContent ?? '';
}

/**
 * Whether the caret is at the end of the field (for trailing-trigger gestures).
 * contentEditable uses selection; returns true when selection APIs unavailable
 * (fail-open so gesture still works in limited environments).
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
    // Collapse check: caret (not range selection) near end of content
    if (!range.collapsed) return false;
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.endContainer, range.endOffset);
    const textBefore = pre.toString();
    const full = el.textContent ?? '';
    return textBefore.length >= full.length;
  } catch {
    return true;
  }
}

/** Whether the element is still connected and editable for write-back */
export function isStillWritable(el: HTMLElement): boolean {
  return el.isConnected && isEditableElement(el) && !isPasswordField(el) && !isCodeEditor(el);
}
