/**
 * Section Picker — visual element picker for section translation.
 * Enters a mode where hovering highlights block-level elements
 * and clicking translates just that section.
 */

import { DATA_ATTRS } from '@/lib/constants';

const HIGHLIGHT_CLASS = 'anyllm-section-highlight';
const MIN_SIZE = 50;
const SKIP_TAGS = new Set(['BODY', 'HTML']);

/** Tags that are always block-level per HTML spec — avoids getComputedStyle
 *  for the common case, reducing layout thrashing during picker hover. */
const BLOCK_TAGS = new Set([
  'DIV', 'P', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE',
  'NAV', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR',
  'BLOCKQUOTE', 'PRE', 'FORM', 'FIELDSET', 'FIGURE', 'FIGCAPTION',
  'DETAILS', 'SUMMARY', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR',
  'ADDRESS', 'DL', 'DT', 'DD', 'BR', 'PICTURE', 'IFRAME', 'VIDEO',
]);

/** Cache of computed block-level results for tags not in BLOCK_TAGS. */
const blockLevelCache = new WeakMap<Element, boolean>();

let isActive = false;
let highlightedEl: Element | null = null;
let onSectionSelected: ((el: Element) => void) | null = null;

function isExtensionNode(el: Element): boolean {
  return el.hasAttribute(DATA_ATTRS.ROLE) || el.hasAttribute(DATA_ATTRS.PIECE_ID);
}

function isBlockLevel(el: Element): boolean {
  // Fast path: known block-level tags per HTML spec — no computed style needed.
  if (BLOCK_TAGS.has(el.tagName)) return true;

  // Cached result from a previous getComputedStyle call.
  const cached = blockLevelCache.get(el);
  if (cached !== undefined) return cached;

  const style = window.getComputedStyle(el);
  const isBlock = style.display === 'block' || style.display === 'flex' || style.display === 'grid'
    || style.display === 'table' || style.display === 'list-item';
  blockLevelCache.set(el, isBlock);
  return isBlock;
}

function findPickableAncestor(target: Element): Element | null {
  let el: Element | null = target;
  while (el && el !== document.body && el !== document.documentElement) {
    if (SKIP_TAGS.has(el.tagName)) return null;
    if (isExtensionNode(el)) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width >= MIN_SIZE && rect.height >= MIN_SIZE && isBlockLevel(el)) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function clearHighlight(): void {
  if (highlightedEl) {
    highlightedEl.classList.remove(HIGHLIGHT_CLASS);
    highlightedEl = null;
  }
}

function onMouseOver(e: MouseEvent): void {
  const target = e.target as Element;
  const pickable = findPickableAncestor(target);
  if (pickable === highlightedEl) return;
  clearHighlight();
  if (pickable) {
    pickable.classList.add(HIGHLIGHT_CLASS);
    highlightedEl = pickable;
  }
}

function onClick(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  if (highlightedEl && onSectionSelected) {
    const selected = highlightedEl;
    const callback = onSectionSelected;
    exitPickerMode();
    callback(selected);
  }
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    exitPickerMode();
  }
}

function onContextMenu(e: MouseEvent): void {
  e.preventDefault();
  exitPickerMode();
}

export function enterPickerMode(callback: (el: Element) => void): void {
  if (isActive) return;
  isActive = true;
  onSectionSelected = callback;
  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('contextmenu', onContextMenu, true);
}

export function exitPickerMode(): void {
  if (!isActive) return;
  isActive = false;
  clearHighlight();
  onSectionSelected = null;
  document.removeEventListener('mouseover', onMouseOver, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown, true);
  document.removeEventListener('contextmenu', onContextMenu, true);
}

export function isPickerActive(): boolean {
  return isActive;
}
