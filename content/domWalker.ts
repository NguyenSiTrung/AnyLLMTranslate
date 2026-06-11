/**
 * DOM Walker — extracts translatable text segments from the page.
 * Uses TreeWalker to traverse the DOM and group text/inline nodes
 * into TranslationPiece[] units split at block element boundaries.
 */

import type { TranslationPiece } from '@/types/translation';
import { deduplicateAncestors } from '@/lib/domUtils';
import { BLOCK_ELEMENTS, SKIP_ELEMENTS, INLINE_ELEMENTS, MAX_PIECE_CHARS, DATA_ATTRS } from '@/lib/constants';

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
}

/** Check if an element should be skipped */
function shouldSkipElement(element: Element, excludeSelectors?: string[]): boolean {
  // Skip known non-translatable elements
  if (SKIP_ELEMENTS.has(element.tagName)) return true;

  // Skip extension-injected nodes
  if (element.hasAttribute(DATA_ATTRS.TRANSLATED)) return true;
  if (element.getAttribute(DATA_ATTRS.ROLE) === 'translation') return true;

  // Skip translate="no" and .notranslate
  if (element.getAttribute('translate') === 'no') return true;
  if (element.classList.contains('notranslate')) return true;

  // Skip contentEditable regions (attribute check as fallback for jsdom)
  if (element.getAttribute('contenteditable') === 'true') return true;
  if ('isContentEditable' in element && (element as HTMLElement).isContentEditable) return true;

  // Skip elements matching any exclude selector
  if (excludeSelectors && excludeSelectors.length > 0) {
    for (const selector of excludeSelectors) {
      if (!selector) continue;
      try {
        if (element.matches(selector)) return true;
      } catch {
        // Invalid selector, ignore
      }
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
      const nested = extractPieces(el, { excludeSelectors: options.excludeSelectors });
      allPieces.push(...nested);
    }
    return allPieces;
  }

  const pieces: TranslationPiece[] = [];
  let currentTextNodes: Text[] = [];
  let currentParent: Element | null = null;

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

    // Split long texts at sentence boundaries
    if (trimmed.length > MAX_PIECE_CHARS) {
      const parts = splitAtSentenceBoundary(trimmed, MAX_PIECE_CHARS);
      for (const part of parts) {
        pieces.push({
          id: generatePieceId(),
          parentElement: anchorElement,
          textNodes: [...currentTextNodes],
          text: part,
          isTranslated: false,
        });
      }
    } else {
      pieces.push({
        id: generatePieceId(),
        parentElement: anchorElement,
        textNodes: [...currentTextNodes],
        text: trimmed,
        isTranslated: false,
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
