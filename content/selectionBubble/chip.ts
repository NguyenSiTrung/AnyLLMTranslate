/**
 * Floating translate chip shown after text selection.
 */

import { CHIP_CLASS } from './types';

let currentChip: HTMLButtonElement | null = null;

function createBrandMarkImg(size = 32): HTMLImageElement {
  const img = document.createElement('img');
  try {
    img.src = chrome.runtime.getURL('icon/128.png');
  } catch {
    img.src = '';
  }
  img.width = size;
  img.height = size;
  img.alt = '';
  img.draggable = false;
  img.setAttribute('aria-hidden', 'true');
  return img;
}

/** Create the floating translate button near document coords (selection center). */
export function createTranslateChip(xDoc: number, yDoc: number): HTMLButtonElement {
  removeTranslateChip();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = CHIP_CLASS;
  btn.setAttribute('data-anyllm-role', 'selection-btn');
  btn.setAttribute('aria-label', 'Translate selection');
  btn.appendChild(createBrandMarkImg(32));

  btn.style.left = `${xDoc}px`;
  btn.style.top = `${yDoc - 40}px`;

  document.body.appendChild(btn);
  currentChip = btn;
  return btn;
}

export function removeTranslateChip(): void {
  if (currentChip) {
    currentChip.remove();
    currentChip = null;
  }
}

export function getTranslateChip(): HTMLButtonElement | null {
  return currentChip;
}
