/**
 * Translation Display — injects bilingual translations into the DOM.
 * Implements the "Dividing Line" theme as default.
 */

import { DATA_ATTRS } from '@/lib/constants';
import type { PageState } from '@/lib/constants';

/** Apply a single translation below its original paragraph */
export function applyTranslation(
  parentElement: Element,
  pieceId: string,
  translatedText: string,
): void {
  // Don't inject if already translated
  if (document.querySelector(`[${DATA_ATTRS.PIECE_ID}="${pieceId}"]`)) {
    return;
  }

  // Mark original element
  parentElement.setAttribute(DATA_ATTRS.ROLE, 'original');
  parentElement.setAttribute(DATA_ATTRS.TRANSLATED, '');

  // Create translation element
  const translationEl = document.createElement('div');
  translationEl.setAttribute(DATA_ATTRS.ROLE, 'translation');
  translationEl.setAttribute(DATA_ATTRS.PIECE_ID, pieceId);
  translationEl.className = 'lingua-lens-translation';
  translationEl.textContent = translatedText;

  // Insert after the parent element
  parentElement.after(translationEl);
}

/** Remove a single translation by piece ID */
export function removeTranslation(pieceId: string): void {
  const el = document.querySelector(`[${DATA_ATTRS.PIECE_ID}="${pieceId}"]`);
  if (el) {
    el.remove();
  }

  // Clean up original marker if no more translations
  const originals = document.querySelectorAll(`[${DATA_ATTRS.TRANSLATED}]`);
  for (const original of originals) {
    original.removeAttribute(DATA_ATTRS.ROLE);
    original.removeAttribute(DATA_ATTRS.TRANSLATED);
  }
}

/** Remove all translations from the page */
export function removeAllTranslations(): void {
  // Remove all translation elements
  const translations = document.querySelectorAll(`[${DATA_ATTRS.ROLE}="translation"]`);
  for (const el of translations) {
    el.remove();
  }

  // Clean up original markers
  const originals = document.querySelectorAll(`[${DATA_ATTRS.TRANSLATED}]`);
  for (const original of originals) {
    original.removeAttribute(DATA_ATTRS.ROLE);
    original.removeAttribute(DATA_ATTRS.TRANSLATED);
  }

  // Reset page state
  setPageState('off');
}

/** Set the page translation state */
export function setPageState(state: PageState): void {
  document.documentElement.setAttribute(DATA_ATTRS.STATE, state);
}

/** Get the current page translation state */
export function getPageState(): PageState {
  return (document.documentElement.getAttribute(DATA_ATTRS.STATE) as PageState) ?? 'off';
}

/** Toggle page state: off → dual → translation-only → off */
export function togglePageState(): PageState {
  const current = getPageState();
  let next: PageState;

  switch (current) {
    case 'off':
      next = 'dual';
      break;
    case 'dual':
      next = 'off';
      break;
    case 'translation-only':
      next = 'off';
      break;
    default:
      next = 'dual';
  }

  setPageState(next);
  return next;
}
