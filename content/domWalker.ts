/**
 * DOM Walker — extracts translatable text segments from the page.
 * Uses TreeWalker to traverse the DOM and group text/inline nodes
 * into TranslationPiece[] units split at block element boundaries.
 */

import type { TranslationPiece } from '@/types/translation';
import { deduplicateAncestors, matchesCached, classifyInArticle, findAsideRegionRoot } from '@/lib/domUtils';
import { encodeInlineHtml } from '@/lib/richTranslate';
import { BLOCK_ELEMENTS, SKIP_ELEMENTS, INLINE_ELEMENTS, MAX_PIECE_CHARS, DATA_ATTRS, BODY_TRANSLATE_TAGS, ASIDE_MAX_TEXT_PER_PARAGRAPH, ASIDE_MAX_TEXT_PER_REGION } from '@/lib/constants';

let pieceCounter = 0;

/** Generate a unique piece ID */
function generatePieceId(): string {
  return `lp-${++pieceCounter}`;
}

/** Reset piece counter (for testing) */
export function resetPieceCounter(): void {
  pieceCounter = 0;
}

export interface ExtractOptions {
  includeSelectors?: string[];
  excludeSelectors?: string[];
  /** When true, capture inline markup as `<z id="N">` placeholders (FR-1 rich translate). */
  enableRichTranslate?: boolean;
  /** FR-4: When true, only descend into body-level children whose tag is in BODY_TRANSLATE_TAGS. */
  enableBodyTagWhitelist?: boolean;
  /** FR-5: When true, apply per-paragraph and per-region text caps within aside regions. */
  enableAsideCaps?: boolean;
}

/**
 * Inline elements matched by exclude / translate="no" stay inside the parent
 * piece so surrounding prose still forms a complete sentence. Hard-skip only
 * applies to non-inline (block/container) matches.
 *
 * Example: exclude `code` must not turn
 *   "Add to config (<code>~/.x</code>):"
 * into "Add to config ( ):" — the path stays in the piece; rich-translate +
 * the system prompt keep the path untranslated.
 */
function isSoftPreserveInline(element: Element): boolean {
  return INLINE_ELEMENTS.has(element.tagName);
}

/** Check if an element should be hard-skipped (TreeWalker FILTER_REJECT). */
function shouldSkipElement(element: Element, excludeSelectors?: string[]): boolean {
  // Skip known non-translatable elements
  if (SKIP_ELEMENTS.has(element.tagName)) return true;

  // Skip extension-injected nodes
  if (element.hasAttribute(DATA_ATTRS.TRANSLATED)) return true;
  if (element.getAttribute(DATA_ATTRS.ROLE) === 'translation') return true;

  // Skip contentEditable regions (attribute check as fallback for jsdom)
  if (element.getAttribute('contenteditable') === 'true') return true;
  if ('isContentEditable' in element && (element as HTMLElement).isContentEditable) return true;

  // translate="no" / .notranslate: hard-skip block regions only.
  // Inline spans keep their text in the parent piece (soft preserve).
  if (element.getAttribute('translate') === 'no' && !isSoftPreserveInline(element)) return true;
  if (element.classList.contains('notranslate') && !isSoftPreserveInline(element)) return true;

  // Exclude selectors: hard-skip only non-inline matches (pre, .sidebar, …).
  // Inline matches (code, kbd, span.term, …) stay in the surrounding piece.
  if (excludeSelectors && excludeSelectors.length > 0) {
    for (const selector of excludeSelectors) {
      if (!selector) continue;
      if (matchesCached(element, selector) && !isSoftPreserveInline(element)) return true;
    }
  }

  return false;
}

/** Check if an element is a block element that splits pieces */
function isBlockElement(element: Element): boolean {
  if (BLOCK_ELEMENTS.has(element.tagName)) return true;

  // Account for framework-specific block semantics (e.g., Mintlify, styled-components)
  const dataAs = element.getAttribute('data-as');
  if (dataAs && BLOCK_ELEMENTS.has(dataAs.toUpperCase())) {
    return true;
  }

  return false;
}

/** Split text at sentence boundaries near the limit */
function splitAtSentenceBoundary(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    // Try to find a sentence boundary near maxChars
    const segment = remaining.slice(0, maxChars);
    const lastPeriod = segment.lastIndexOf('. ');
    const lastQuestion = segment.lastIndexOf('? ');
    const lastExclaim = segment.lastIndexOf('! ');
    const lastNewline = segment.lastIndexOf('\n');

    const breakPoint = Math.max(lastPeriod, lastQuestion, lastExclaim, lastNewline);

    if (breakPoint > maxChars * 0.3) {
      // Found a good sentence boundary
      parts.push(remaining.slice(0, breakPoint + 1).trim());
      remaining = remaining.slice(breakPoint + 1).trim();
    } else {
      // No good boundary — break at word boundary
      const lastSpace = segment.lastIndexOf(' ');
      if (lastSpace > maxChars * 0.3) {
        parts.push(remaining.slice(0, lastSpace).trim());
        remaining = remaining.slice(lastSpace).trim();
      } else {
        // Force break
        parts.push(remaining.slice(0, maxChars).trim());
        remaining = remaining.slice(maxChars).trim();
      }
    }
  }

  if (remaining.trim()) {
    parts.push(remaining.trim());
  }

  return parts;
}

/** Extract translatable pieces from a root element */
export function extractPieces(root: Element = document.body, options: ExtractOptions = {}): TranslationPiece[] {
  // If include selectors are specified, extract from each matching element
  if (options.includeSelectors && options.includeSelectors.length > 0) {
    const includeRoots = new Set<Element>();
    for (const selector of options.includeSelectors) {
      if (!selector) continue;
      try {
        const matches = root.querySelectorAll(selector);
        for (const el of matches) {
          includeRoots.add(el);
        }
      } catch {
        // Invalid selector, skip
      }
    }
    if (includeRoots.size === 0) return [];

    // Deduplicate: keep only outermost elements
    const outermost = deduplicateAncestors([...includeRoots]);

    const allPieces: TranslationPiece[] = [];
    for (const el of outermost) {
      // Forward walker flags; do not re-pass includeSelectors (already scoped to el).
      const nested = extractPieces(el, {
        excludeSelectors: options.excludeSelectors,
        enableRichTranslate: options.enableRichTranslate,
        enableAsideCaps: options.enableAsideCaps,
      });
      allPieces.push(...nested);
    }
    return allPieces;
  }

  const pieces: TranslationPiece[] = [];
  let currentTextNodes: Text[] = [];
  let currentParent: Element | null = null;
  // FR-5: per-region cumulative char tracker for aside caps.
  const asideRegionChars = new Map<Element, number>();

  /** Find the deepest common ancestor element of a list of text nodes */
  function getCommonAncestor(nodes: Node[]): Element | null {
    if (nodes.length === 0) return null;
    let ancestor = nodes[0].parentElement;
    if (!ancestor) return null;

    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i];
      while (ancestor && !ancestor.contains(node)) {
        ancestor = ancestor.parentElement;
      }
      if (!ancestor) return null;
    }
    return ancestor;
  }

  function flushPiece(): void {
    if (currentTextNodes.length === 0 || !currentParent) return;

    const text = currentTextNodes.map((n) => n.textContent ?? '').join('');
    const trimmed = text.trim();

    // Skip empty or whitespace-only text
    if (!trimmed || trimmed.length < 2) {
      currentTextNodes = [];
      return;
    }

    // Determine tightest boundary for injection rather than loose block layout container
    let anchorElement = getCommonAncestor(currentTextNodes);
    if (!anchorElement || anchorElement.tagName === 'BODY' || anchorElement.tagName === 'HTML') {
      anchorElement = currentParent;
    }

    // Walk up from inline elements to ensure anchor is a suitable container for hiding
    // This fixes translation-only mode where we'd otherwise hide just a link/span
    while (anchorElement && INLINE_ELEMENTS.has(anchorElement.tagName)) {
      anchorElement = anchorElement.parentElement;
    }
    // Ensure we have a valid anchor after walking up
    if (!anchorElement || anchorElement.tagName === 'BODY' || anchorElement.tagName === 'HTML') {
      anchorElement = currentParent;
    }

    // Never anchor to <body> or <html> — in replace mode hiding those would blank the page
    if (anchorElement && (anchorElement.tagName === 'BODY' || anchorElement.tagName === 'HTML')) {
      currentTextNodes = [];
      return;
    }

    // Rich translate: encode inline markup from the anchor's innerHTML so the
    // LLM receives `<z id="N">…</z>` tokens and the markup can be reconstructed
    // on decode (FR-1). Only applied to single-piece anchors (no sentence split)
    // so placeholder ids stay aligned with the piece text. Long pieces that
    // would split fall back to plain text (no variables) — safe degradation.
    let richText = trimmed;
    let richVariables: TranslationPiece['variables'];
    if (options.enableRichTranslate && anchorElement) {
      const encoded = encodeInlineHtml(anchorElement.innerHTML);
      // Use the encoded flat text only when it carries placeholders AND the
      // piece isn't going to be split (keeps id alignment correct).
      if (encoded.variables.length > 0 && trimmed.length <= MAX_PIECE_CHARS) {
        richText = encoded.flatText.trim();
        richVariables = encoded.variables;
      }
    }

    // Split long texts at sentence boundaries
    // FR-5: aside caps — skip pieces in aside regions that exceed per-paragraph
    // or per-region char limits. Applied before splitting so the per-paragraph
    // cap checks the full text, not each split part.
    if (options.enableAsideCaps && anchorElement) {
      const asideRoot = findAsideRegionRoot(anchorElement);
      if (asideRoot) {
        if (richText.length > ASIDE_MAX_TEXT_PER_PARAGRAPH) {
          currentTextNodes = [];
          return;
        }
        const regionChars = asideRegionChars.get(asideRoot) ?? 0;
        if (regionChars >= ASIDE_MAX_TEXT_PER_REGION) {
          currentTextNodes = [];
          return;
        }
        asideRegionChars.set(asideRoot, regionChars + richText.length);
      }
    }

    if (richText.length > MAX_PIECE_CHARS) {
      const parts = splitAtSentenceBoundary(richText, MAX_PIECE_CHARS);
      const inArticleContext = classifyInArticle(anchorElement);
      for (const part of parts) {
        pieces.push({
          id: generatePieceId(),
          parentElement: anchorElement,
          textNodes: [...currentTextNodes],
          text: part,
          isTranslated: false,
          inArticleContext,
        });
      }
    } else {
      const inArticleContext = classifyInArticle(anchorElement);
      pieces.push({
        id: generatePieceId(),
        parentElement: anchorElement,
        textNodes: [...currentTextNodes],
        text: richText,
        isTranslated: false,
        ...(richVariables ? { variables: richVariables } : {}),
        inArticleContext,
      });
    }

    currentTextNodes = [];
  }

  // Use TreeWalker for efficient DOM traversal
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node: Node): number {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          if (shouldSkipElement(el, options.excludeSelectors)) {
            return NodeFilter.FILTER_REJECT; // Skip element and all descendants
          }
          // FR-4: body-tag whitelist — only descend into direct children of
          // <body> whose tag is in BODY_TRANSLATE_TAGS. Other top-level tags
          // (NAV, ASIDE, HEADER, FOOTER, FORM, TABLE, …) are skipped entirely.
          if (options.enableBodyTagWhitelist && root.tagName === 'BODY' && el.parentElement === root) {
            if (!BODY_TRANSLATE_TAGS.has(el.tagName)) {
              return NodeFilter.FILTER_REJECT;
            }
          }
          return NodeFilter.FILTER_ACCEPT;
        }

        // Text node — accept if non-empty
        if (node.nodeType === Node.TEXT_NODE) {
          if (!node.textContent) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }

        return NodeFilter.FILTER_SKIP;
      },
    },
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (isBlockElement(el)) {
        // Block element — flush current piece and start new one
        flushPiece();
        currentParent = el;
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      // Find the closest block parent
      let blockParent: Element | null = textNode.parentElement;
      while (blockParent && !isBlockElement(blockParent) && blockParent !== root) {
        blockParent = blockParent.parentElement;
      }
      if (!blockParent) blockParent = root as Element;

      // If parent changed, flush and start new piece
      if (blockParent !== currentParent) {
        flushPiece();
        currentParent = blockParent;
      }

      currentTextNodes.push(textNode);
    }
  }

  // Flush remaining
  flushPiece();

  return pieces;
}
