/**
 * Piece text helpers shared by the DOM walker and the content script's
 * source-unchanged check, so extraction and invalidation agree on one text.
 */

/** Upper bound on nodes scanned between two adjacent group text nodes. */
const MAX_SEPARATOR_SCAN = 256;

/** Next node in document order (pre-order traversal). */
function nextInDocumentOrder(node: Node): Node | null {
  if (node.firstChild) return node.firstChild;
  let current: Node | null = node;
  while (current) {
    if (current.nextSibling) return current.nextSibling;
    current = current.parentNode;
  }
  return null;
}

/**
 * FR-3: separator between two adjacent text nodes of one piece group — one
 * `\n` per `<br>` between them (capped at a blank line), else nothing.
 */
export function groupSeparator(prev: Text, next: Text): string {
  let breaks = 0;
  let node = nextInDocumentOrder(prev);
  for (let steps = 0; node && node !== next && steps < MAX_SEPARATOR_SCAN; steps++) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'BR') breaks++;
    node = nextInDocumentOrder(node);
  }
  return '\n'.repeat(Math.min(breaks, 2));
}

/**
 * FR-3: join a piece's text nodes, turning `<br>` between them into newlines.
 * Shared by extraction and the sm7n source-unchanged check so both agree.
 */
export function joinGroupText(textNodes: readonly Text[]): string {
  let out = '';
  for (let i = 0; i < textNodes.length; i++) {
    if (i > 0) out += groupSeparator(textNodes[i - 1], textNodes[i]);
    out += textNodes[i].data;
  }
  return out;
}
