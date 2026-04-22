/**
 * Section Picker — visual element picker for section translation.
 * Enters a mode where hovering highlights block-level elements
 * and clicking translates just that section.
 */

import { DATA_ATTRS } from '@/lib/constants';

const HIGHLIGHT_CLASS = 'anyllm-section-highlight';
const MIN_SIZE = 50;
const SKIP_TAGS = new Set(['BODY', 'HTML']);

let isActive = false;
let highlightedEl: Element | null = null;
let onSectionSelected: ((el: Element) => void) | null = null;

function isExtensionNode(el: Element): boolean {
  return el.hasAttribute(DATA_ATTRS.ROLE) || el.hasAttribute(DATA_ATTRS.PIECE_ID);
}

function isBlockLevel(el: Element): boolean {
  const style = window.getComputedStyle(el);
  return style.display === 'block' || style.display === 'flex' || style.display === 'grid'
    || style.display === 'table' || style.display === 'list-item';
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
