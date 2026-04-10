/**
 * DOM Walker — extracts translatable text segments from the page.
 * Uses TreeWalker to traverse the DOM and group text/inline nodes
 * into TranslationPiece[] units split at block element boundaries.
 */

import type { TranslationPiece } from '@/types/translation';
import { BLOCK_ELEMENTS, SKIP_ELEMENTS, MAX_PIECE_CHARS, DATA_ATTRS } from '@/lib/constants';

let pieceCounter = 0;

/** Generate a unique piece ID */
function generatePieceId(): string {
  return `lp-${++pieceCounter}`;
}

/** Reset piece counter (for testing) */
export function resetPieceCounter(): void {
  pieceCounter = 0;
}

/** Check if an element should be skipped */
function shouldSkipElement(element: Element): boolean {
  // Skip known non-translatable elements
  if (SKIP_ELEMENTS.has(element.tagName)) return true;

  // Skip extension-injected nodes
  if (element.hasAttribute(DATA_ATTRS.TRANSLATED)) return true;
  if (element.getAttribute(DATA_ATTRS.ROLE) === 'translation') return true;

  // Skip translate="no" and .notranslate
  if (element.getAttribute('translate') === 'no') return true;
  if (element.classList.contains('notranslate')) return true;

  // Skip contentEditable regions
  if ('isContentEditable' in element && (element as HTMLElement).isContentEditable) return true;

  return false;
}

/** Check if an element is a block element that splits pieces */
function isBlockElement(element: Element): boolean {
  return BLOCK_ELEMENTS.has(element.tagName);
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
export function extractPieces(root: Element = document.body): TranslationPiece[] {
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

    // Split long texts at sentence boundaries
    if (trimmed.length > MAX_PIECE_CHARS) {
      const parts = splitAtSentenceBoundary(trimmed, MAX_PIECE_CHARS);
      for (const part of parts) {
        pieces.push({
          id: generatePieceId(),
          parentElement: anchorElement,
          textNodes: [...currentTextNodes],
          originalHTML: anchorElement.innerHTML,
          text: part,
          isTranslated: false,
        });
      }
    } else {
      pieces.push({
        id: generatePieceId(),
        parentElement: anchorElement,
        textNodes: [...currentTextNodes],
        originalHTML: anchorElement.innerHTML,
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
          if (shouldSkipElement(el)) {
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
