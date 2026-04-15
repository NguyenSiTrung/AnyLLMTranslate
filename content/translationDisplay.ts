/**
 * Translation Display — injects bilingual translations into the DOM.
 * Supports 16+ visual themes and translation positioning.
 */

import { DATA_ATTRS } from '@/lib/constants';
import type { PageState } from '@/lib/constants';
import type { ThemeName, TranslationPosition, DarkMode, DisplayMode } from '@/types/config';

/** Apply theme attribute to document root */
export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute('data-anyllm-theme', theme);
}

/** Apply translation position attribute to document root */
export function applyPosition(position: TranslationPosition): void {
  document.documentElement.setAttribute('data-anyllm-position', position);
}

/** Apply dark mode class to document root */
export function applyDarkMode(mode: DarkMode): void {
  if (mode === 'dark') {
    document.documentElement.classList.add('anyllm-dark');
  } else {
    document.documentElement.classList.remove('anyllm-dark');
  }
  // 'auto' mode relies on CSS @media (prefers-color-scheme: dark) — no class needed
}

/** Show a loading spinner placeholder below parentElement, in the same slot as the eventual translation.
 * Idempotent: calling twice for the same pieceId does nothing. */
export function showLoadingPlaceholder(parentElement: Element, pieceId: string): void {
  // Already exists — do nothing
  if (document.querySelector(`[${DATA_ATTRS.PIECE_ID}="${pieceId}"]`)) {
    return;
  }

  // Mark original element
  parentElement.setAttribute(DATA_ATTRS.ROLE, 'original');

  // Create placeholder (spinner)
  const placeholder = document.createElement('span');
  placeholder.setAttribute(DATA_ATTRS.ROLE, 'translation');
  placeholder.setAttribute(DATA_ATTRS.PIECE_ID, pieceId);
  placeholder.className = 'anyllm-translate-translation anyllm-translate-loading';

  parentElement.after(placeholder);
}

/** Apply a single translation relative to its original paragraph.
 * If a loading placeholder already exists for this pieceId, updates it in-place
 * (swaps class, sets text) to avoid layout shift and duplicate elements. */
export function applyTranslation(
  parentElement: Element,
  pieceId: string,
  translatedText: string,
): void {
  // Mark original element
  parentElement.setAttribute(DATA_ATTRS.ROLE, 'original');
  parentElement.setAttribute(DATA_ATTRS.TRANSLATED, '');

  const existing = document.querySelector(`[${DATA_ATTRS.PIECE_ID}="${pieceId}"]`);
  if (existing) {
    // Update placeholder in-place: remove spinner class, set translated text
    existing.classList.remove('anyllm-translate-loading');
    existing.textContent = translatedText;
    // Re-trigger fade-in animation by forcing reflow
    (existing as HTMLElement).style.animation = 'none';
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    (existing as HTMLElement).offsetHeight;
    (existing as HTMLElement).style.animation = '';
    return;
  }

  // No placeholder yet — create translation element (fallback)
  const translationEl = document.createElement('span');
  translationEl.setAttribute(DATA_ATTRS.ROLE, 'translation');
  translationEl.setAttribute(DATA_ATTRS.PIECE_ID, pieceId);
  translationEl.className = 'anyllm-translate-translation';
  translationEl.textContent = translatedText;

  parentElement.after(translationEl);
}



/** Set error state — updates the placeholder element in-place if it exists. */
export function setErrorState(
  parentElement: Element,
  pieceId: string,
  errorMessage: string,
  onRetry?: () => void,
): void {
  parentElement.setAttribute('data-anyllm-error', '');

  const existing = document.querySelector(`[${DATA_ATTRS.PIECE_ID}="${pieceId}"]`);
  if (existing) {
    // Update placeholder in-place: swap loading class for error state
    existing.classList.remove('anyllm-translate-loading');
    existing.setAttribute('data-anyllm-error', '');
    existing.textContent = `⚠ Translation failed: ${errorMessage}`;
    existing.setAttribute('title', 'Click to retry');

    if (onRetry) {
      existing.addEventListener('click', () => {
        clearErrorState(parentElement, pieceId);
        onRetry();
      }, { once: true });
    }
    return;
  }

  // No placeholder yet — create error element (fallback)
  const errorEl = document.createElement('span');
  errorEl.setAttribute(DATA_ATTRS.ROLE, 'translation');
  errorEl.setAttribute(DATA_ATTRS.PIECE_ID, pieceId);
  errorEl.className = 'anyllm-translate-translation';
  errorEl.setAttribute('data-anyllm-error', '');
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
  parentElement.removeAttribute('data-anyllm-error');
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

  // Clean up loading/error states on original elements (legacy data-anyllm-loading)
  const loadingEls = document.querySelectorAll('[data-anyllm-loading]');
  for (const el of loadingEls) {
    el.removeAttribute('data-anyllm-loading');
  }
  const errorEls = document.querySelectorAll('[data-anyllm-error]');
  for (const el of errorEls) {
    el.removeAttribute('data-anyllm-error');
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

/** Toggle page state: off → mode → off */
export function togglePageState(displayMode?: DisplayMode): PageState {
  const current = getPageState();
  let next: PageState;

  switch (current) {
    case 'off':
      next = displayMode === 'translation-only' ? 'translation-only' : 'dual';
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
