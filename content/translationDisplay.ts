/**
 * Translation Display — injects bilingual translations into the DOM.
 * Supports 16+ visual themes and translation positioning.
 */

import { DATA_ATTRS } from '@/lib/constants';
import type { PageState } from '@/lib/constants';
import type { ThemeName, TranslationPosition, DarkMode } from '@/types/config';

/** Apply theme attribute to document root */
export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute('data-lingua-theme', theme);
}

/** Apply translation position attribute to document root */
export function applyPosition(position: TranslationPosition): void {
  document.documentElement.setAttribute('data-lingua-position', position);
}

/** Apply dark mode class to document root */
export function applyDarkMode(mode: DarkMode): void {
  if (mode === 'dark') {
    document.documentElement.classList.add('lingua-dark');
  } else {
    document.documentElement.classList.remove('lingua-dark');
  }
  // 'auto' mode relies on CSS @media (prefers-color-scheme: dark) — no class needed
}

/** Apply a single translation relative to its original paragraph */
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

/** Set loading state on an element (shows shimmer) */
export function setLoadingState(parentElement: Element, isLoading: boolean): void {
  if (isLoading) {
    parentElement.setAttribute('data-lingua-loading', '');
  } else {
    parentElement.removeAttribute('data-lingua-loading');
  }
}

/** Set error state on an element (shows error indicator) */
export function setErrorState(
  parentElement: Element,
  pieceId: string,
  errorMessage: string,
  onRetry?: () => void,
): void {
  parentElement.setAttribute('data-lingua-error', '');

  // Check if error translation element already exists
  const existing = document.querySelector(`[${DATA_ATTRS.PIECE_ID}="${pieceId}"]`);
  if (existing) {
    existing.textContent = `⚠ Translation failed: ${errorMessage}`;
    return;
  }

  // Create error element
  const errorEl = document.createElement('div');
  errorEl.setAttribute(DATA_ATTRS.ROLE, 'translation');
  errorEl.setAttribute(DATA_ATTRS.PIECE_ID, pieceId);
  errorEl.className = 'lingua-lens-translation';
  errorEl.textContent = `⚠ Translation failed: ${errorMessage}`;
  errorEl.title = 'Click to retry';

  if (onRetry) {
    errorEl.addEventListener('click', () => {
      clearErrorState(parentElement, pieceId);
      onRetry();
    }, { once: true });
  }

  parentElement.after(errorEl);
}

/** Clear error state from an element */
export function clearErrorState(parentElement: Element, pieceId: string): void {
  parentElement.removeAttribute('data-lingua-error');
  const existing = document.querySelector(`[${DATA_ATTRS.PIECE_ID}="${pieceId}"]`);
  if (existing) {
    existing.remove();
  }
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

  // Clean up loading/error states
  const loadingEls = document.querySelectorAll('[data-lingua-loading]');
  for (const el of loadingEls) {
    el.removeAttribute('data-lingua-loading');
  }
  const errorEls = document.querySelectorAll('[data-lingua-error]');
  for (const el of errorEls) {
    el.removeAttribute('data-lingua-error');
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
