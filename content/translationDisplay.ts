/**
 * Translation Display — injects bilingual translations into the DOM.
 * Supports 16+ visual themes and translation positioning.
 */

import { DATA_ATTRS } from '@/lib/constants';
import type { PageState } from '@/lib/constants';
import type { ThemeName, TranslationPosition, DarkMode, DisplayMode, CustomThemeConfig } from '@/types/config';

/** Apply theme attribute to document root */
export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute('data-anyllm-theme', theme);
}

/** Apply custom CSS variables when custom theme is active */
export function applyCustomTheme(config: CustomThemeConfig): void {
  const root = document.documentElement;
  root.style.setProperty('--anyllm-custom-text-color', config.textColor);
  root.style.setProperty('--anyllm-custom-bg-color', config.backgroundColor);
  root.style.setProperty('--anyllm-custom-border-style', config.borderStyle);
  root.style.setProperty('--anyllm-custom-border-color', config.borderColor);
  root.style.setProperty('--anyllm-custom-font-style', config.fontStyle);
  const fontSizeMap: Record<CustomThemeConfig['fontSize'], string> = {
    smaller: '0.9em',
    same: 'inherit',
    larger: '1.1em',
  };
  root.style.setProperty('--anyllm-custom-font-size', fontSizeMap[config.fontSize]);
}

/** Clear custom CSS variables when switching away from custom theme */
export function clearCustomTheme(): void {
  const root = document.documentElement;
  root.style.removeProperty('--anyllm-custom-text-color');
  root.style.removeProperty('--anyllm-custom-bg-color');
  root.style.removeProperty('--anyllm-custom-border-style');
  root.style.removeProperty('--anyllm-custom-border-color');
  root.style.removeProperty('--anyllm-custom-font-style');
  root.style.removeProperty('--anyllm-custom-font-size');
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
  // Defensive: never mark <body> or <html> as original
  if (parentElement.tagName === 'BODY' || parentElement.tagName === 'HTML') {
    return;
  }

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
  // Defensive: never mark <body> or <html> as original — that would hide the page
  if (parentElement.tagName === 'BODY' || parentElement.tagName === 'HTML') {
    return;
  }

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

/** Show a compact inline loading indicator inside parentElement for short pieces.
 *  Idempotent: calling twice for the same pieceId does nothing. */
export function showInlineLoadingPlaceholder(parentElement: Element, pieceId: string): void {
  if (parentElement.tagName === 'BODY' || parentElement.tagName === 'HTML') return;
  if (document.querySelector(`[${DATA_ATTRS.PIECE_ID}="${pieceId}"]`)) return;

  parentElement.setAttribute(DATA_ATTRS.ROLE, 'original');

  const placeholder = document.createElement('span');
  placeholder.setAttribute(DATA_ATTRS.PIECE_ID, pieceId);
  placeholder.className = 'anyllm-inline-bilingual anyllm-inline-bilingual-loading';

  parentElement.appendChild(placeholder);
}

/** Format inline translation text — uses parentheses for most languages,
 *  and appropriate brackets for CJK scripts. */
function formatInlineText(translatedText: string, isTranslationOnly: boolean): string {
  if (isTranslationOnly) {
    // In translation-only mode, show just the translation (no brackets)
    return translatedText;
  }
  return ` (${translatedText})`;
}

/** Check if current page state is translation-only */
function isTranslationOnlyMode(): boolean {
  return document.documentElement.getAttribute(DATA_ATTRS.STATE) === 'translation-only';
}

/** Detect if an element lives inside a width-constrained multi-column layout.
 *  Walks up the DOM checking computed display for flex, grid, or table-cell.
 *  This catches CSS-class-based layouts that attribute selectors miss. */
function isConstrainedContainer(el: Element): boolean {
  // Direct table cell check (fastest path)
  if (el.tagName === 'TD' || el.tagName === 'TH') return true;
  if (el.closest('table')) return true;

  // Walk ancestors checking computed display
  let parent = el.parentElement;
  let depth = 0;
  while (parent && parent !== document.body && depth < 8) {
    const display = getComputedStyle(parent).display;
    if (
      display === 'flex' || display === 'inline-flex' ||
      display === 'grid' || display === 'inline-grid' ||
      display === 'table-cell' || display === 'table-row' ||
      display === 'table'
    ) {
      return true;
    }
    parent = parent.parentElement;
    depth++;
  }
  return false;
}

/** Apply a translation inline (parenthetical) for short content pieces.
 *  Renders as " (translation)" inside the parent element, not as a block below.
 *  Detects constrained containers (flex/grid/table) and uses block layout to prevent overlap.
 *  @param targetLanguage — ISO code for `lang` attribute (accessibility) */
export function applyInlineTranslation(
  parentElement: Element,
  pieceId: string,
  translatedText: string,
  targetLanguage?: string,
): void {
  if (parentElement.tagName === 'BODY' || parentElement.tagName === 'HTML') return;

  parentElement.setAttribute(DATA_ATTRS.ROLE, 'original');
  parentElement.setAttribute(DATA_ATTRS.TRANSLATED, '');

  const translationOnly = isTranslationOnlyMode();
  const displayText = formatInlineText(translatedText, translationOnly);
  const constrained = isConstrainedContainer(parentElement);

  const existing = document.querySelector(`[${DATA_ATTRS.PIECE_ID}="${pieceId}"]`);
  if (existing) {
    // Update inline placeholder in-place
    existing.classList.remove('anyllm-inline-bilingual-loading');
    if (constrained) existing.classList.add('anyllm-inline-constrained');
    existing.textContent = displayText;
    // Accessibility: set lang for screen readers and title for hover tooltip
    if (targetLanguage) existing.setAttribute('lang', targetLanguage);
    (existing as HTMLElement).title = translatedText;
    // Re-trigger animation
    (existing as HTMLElement).style.animation = 'none';
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    (existing as HTMLElement).offsetHeight;
    (existing as HTMLElement).style.animation = '';
    return;
  }

  // No placeholder — create inline translation element
  const inlineEl = document.createElement('span');
  inlineEl.setAttribute(DATA_ATTRS.PIECE_ID, pieceId);
  inlineEl.className = constrained
    ? 'anyllm-inline-bilingual anyllm-inline-constrained'
    : 'anyllm-inline-bilingual';
  inlineEl.textContent = displayText;
  // Accessibility: lang attribute for correct pronunciation, title for hover
  if (targetLanguage) inlineEl.setAttribute('lang', targetLanguage);
  inlineEl.title = translatedText;

  parentElement.appendChild(inlineEl);
}

/** Set error state on an inline translation element */
export function setInlineErrorState(
  parentElement: Element,
  pieceId: string,
  errorMessage: string,
  onRetry?: () => void,
): void {
  if (parentElement.tagName === 'BODY' || parentElement.tagName === 'HTML') return;

  const existing = document.querySelector(`[${DATA_ATTRS.PIECE_ID}="${pieceId}"]`);
  if (existing) {
    existing.classList.remove('anyllm-inline-bilingual-loading');
    existing.classList.add('anyllm-inline-bilingual-error');
    existing.textContent = ' (⚠ error)';
    (existing as HTMLElement).title = `Translation failed: ${errorMessage}. Click to retry.`;

    if (onRetry) {
      existing.addEventListener('click', () => {
        existing.remove();
        onRetry();
      }, { once: true });
    }
    return;
  }

  // Fallback — create error element
  const errorEl = document.createElement('span');
  errorEl.setAttribute(DATA_ATTRS.PIECE_ID, pieceId);
  errorEl.className = 'anyllm-inline-bilingual anyllm-inline-bilingual-error';
  errorEl.textContent = ' (⚠ error)';
  errorEl.title = `Translation failed: ${errorMessage}. Click to retry.`;

  if (onRetry) {
    errorEl.addEventListener('click', () => {
      errorEl.remove();
      onRetry();
    }, { once: true });
  }

  parentElement.appendChild(errorEl);
}



/** Set error state — updates the placeholder element in-place if it exists. */
export function setErrorState(
  parentElement: Element,
  pieceId: string,
  errorMessage: string,
  onRetry?: () => void,
): void {
  // Defensive: never attach states to layout roots
  if (parentElement.tagName === 'BODY' || parentElement.tagName === 'HTML') {
    return;
  }

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
  // Remove all translation elements (block-level)
  const translations = document.querySelectorAll(`[${DATA_ATTRS.ROLE}="translation"]`);
  for (const el of translations) {
    el.remove();
  }

  // Remove all inline bilingual elements (parenthetical style)
  const inlineBilinguals = document.querySelectorAll('.anyllm-inline-bilingual');
  for (const el of inlineBilinguals) {
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
