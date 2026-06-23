/**
 * Translation Display — injects bilingual translations into the DOM.
 * Supports 16+ visual themes and translation positioning.
 */

import { DATA_ATTRS } from '@/lib/constants';
import { scheduleDomWrite } from '@/lib/performance';
import type { PageState } from '@/lib/constants';
import type { ThemeName, TranslationPosition, DarkMode, DisplayMode, CustomThemeConfig } from '@/types/config';

const ORIGINAL_WRAPPER_ATTR = 'data-anyllm-original-wrapper';
const INLINE_CLONE_ATTR = 'data-anyllm-inline-clone-for';

/** Track all inline-translation-only clone elements for O(1) removal
 *  instead of querySelectorAll on every sync. */
const inlineCloneElements = new Set<HTMLElement>();

/** Re-trigger a CSS fade-in animation without a synchronous forced reflow.
 *  Uses requestAnimationFrame to defer the offsetHeight read so the main
 *  thread isn't blocked for layout calculation per translated piece. */
function restartAnimation(el: HTMLElement): void {
  el.style.animation = 'none';
  requestAnimationFrame(() => {
    // Force a reflow in the rAF callback (next frame) so the browser
    // registers the animation reset. This is still a forced reflow but
    // it's deferred to the next frame, not inline in the call stack.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    el.offsetHeight;
    el.style.animation = '';
  });
}

/** When the mask theme is active, translation elements need a focus
 *  affordance so keyboard-only users can reveal the blurred text without
 *  a mouse hover. CSS already styles `:focus`/`:focus-visible` for the
 *  mask theme; this helper just makes the element programmatically
 *  focusable. No-op for other themes. */
function applyMaskA11yIfNeeded(el: HTMLElement): void {
  if (document.documentElement.getAttribute('data-anyllm-theme') === 'mask') {
    if (!el.hasAttribute('tabindex')) {
      el.setAttribute('tabindex', '0');
    }
  }
}

/** Apply theme attribute to document root */
export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute('data-anyllm-theme', theme);
  // Sync tabindex on existing translations so the mask theme stays
  // keyboard-accessible across theme switches in either direction.
  const translations = document.querySelectorAll<HTMLElement>(`.anyllm-translate-translation`);
  if (theme === 'mask') {
    for (const el of translations) {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    }
  } else {
    for (const el of translations) {
      // Only remove if we set it (value '0' is the marker)
      if (el.getAttribute('tabindex') === '0') el.removeAttribute('tabindex');
    }
  }
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

function isAbovePosition(): boolean {
  return document.documentElement.getAttribute('data-anyllm-position') === 'above';
}

function needsContainedTranslation(parentElement: Element): boolean {
  return parentElement.tagName === 'LI' || parentElement.tagName === 'TD' || parentElement.tagName === 'TH';
}

function markOriginalElement(parentElement: Element): void {
  parentElement.setAttribute(DATA_ATTRS.ROLE, 'original');
  parentElement.setAttribute(DATA_ATTRS.TRANSLATED, '');
}

function ensureOriginalWrapper(parentElement: Element): HTMLElement {
  const existing = parentElement.querySelector(`:scope > [${ORIGINAL_WRAPPER_ATTR}]`);
  if (existing instanceof HTMLElement) {
    return existing;
  }

  const wrapper = document.createElement('span');
  wrapper.setAttribute(ORIGINAL_WRAPPER_ATTR, '');
  wrapper.setAttribute(DATA_ATTRS.ROLE, 'original');
  wrapper.setAttribute(DATA_ATTRS.TRANSLATED, '');

  while (parentElement.firstChild) {
    wrapper.appendChild(parentElement.firstChild);
  }
  parentElement.appendChild(wrapper);

  return wrapper;
}

function insertIntoContainedElement(parentElement: Element, translationEl: HTMLElement): void {
  const wrapper = ensureOriginalWrapper(parentElement);
  if (isAbovePosition()) {
    parentElement.insertBefore(translationEl, wrapper);
  } else {
    parentElement.appendChild(translationEl);
  }
}

function insertAsTableRow(parentElement: Element, translationEl: HTMLElement): void {
  const row = document.createElement('tr');
  row.setAttribute(DATA_ATTRS.ROLE, 'translation');
  const cell = document.createElement('td');
  const columnCount = Math.max(1, parentElement.children.length);
  cell.colSpan = columnCount;
  cell.appendChild(translationEl);
  row.appendChild(cell);

  if (isAbovePosition()) {
    parentElement.before(row);
  } else {
    insertAfterTranslationGroup(parentElement, row);
  }
}

function isTranslationNode(node: Node | null): node is Element {
  return node instanceof Element && node.getAttribute(DATA_ATTRS.ROLE) === 'translation';
}

function insertAfterTranslationGroup(parentElement: Element, translationEl: HTMLElement): void {
  let anchor: Element = parentElement;
  while (isTranslationNode(anchor.nextSibling)) {
    anchor = anchor.nextSibling;
  }
  anchor.after(translationEl);
}

function insertTranslationElement(parentElement: Element, translationEl: HTMLElement): void {
  if (needsContainedTranslation(parentElement)) {
    insertIntoContainedElement(parentElement, translationEl);
    return;
  }

  if (parentElement.tagName === 'TR') {
    insertAsTableRow(parentElement, translationEl);
    return;
  }

  markOriginalElement(parentElement);
  if (isAbovePosition()) {
    parentElement.before(translationEl);
  } else {
    insertAfterTranslationGroup(parentElement, translationEl);
  }
}

function getInlineRenderTarget(parentElement: Element): Element {
  if (needsContainedTranslation(parentElement)) {
    return ensureOriginalWrapper(parentElement);
  }

  markOriginalElement(parentElement);
  return parentElement;
}

function removeInlineTranslationOnlyClones(): void {
  for (const clone of inlineCloneElements) {
    clone.remove();
  }
  inlineCloneElements.clear();
}

function getInlineTranslationText(inlineEl: Element): string {
  const title = (inlineEl as HTMLElement).title.trim();
  if (title) return title;
  return (inlineEl.textContent ?? '').trim().replace(/^\((.*)\)$/, '$1');
}

function debouncedSyncInlineSiblings(): void {
  scheduleDomWrite(syncInlineTranslationOnlySiblings);
}

function syncInlineTranslationOnlySiblings(): void {
  removeInlineTranslationOnlyClones();

  if (getPageState() !== 'translation-only') {
    return;
  }

  const inlineTranslations = document.querySelectorAll(`.anyllm-inline-bilingual[${DATA_ATTRS.PIECE_ID}]`);
  for (const inlineEl of inlineTranslations) {
    const pieceId = inlineEl.getAttribute(DATA_ATTRS.PIECE_ID);
    const parent = inlineEl.parentElement;
    if (!pieceId || !parent) continue;

    const isLoading = inlineEl.classList.contains('anyllm-inline-bilingual-loading');
    const isError = inlineEl.classList.contains('anyllm-inline-bilingual-error');

    const clone = document.createElement('span');
    clone.setAttribute(INLINE_CLONE_ATTR, pieceId);
    clone.setAttribute(DATA_ATTRS.ROLE, 'translation');
    clone.setAttribute('dir', 'auto');

    if (isLoading) {
      // Visible inline spinner sibling so loading remains visible even when
      // the original short inline container is hidden in translation-only mode.
      clone.className = 'anyllm-inline-bilingual anyllm-inline-bilingual-loading anyllm-inline-translation-only-clone';
      clone.setAttribute('role', 'status');
      clone.setAttribute('aria-label', 'Translating');
    } else if (isError) {
      clone.className = 'anyllm-inline-bilingual anyllm-inline-bilingual-error anyllm-inline-translation-only-clone';
      clone.textContent = (inlineEl.textContent ?? '').trim() || ' (⚠ error)';
      clone.setAttribute('role', 'alert');
      const titleSrc = (inlineEl as HTMLElement).title;
      if (titleSrc) (clone as HTMLElement).title = titleSrc;
    } else {
      clone.className = 'anyllm-inline-bilingual anyllm-inline-translation-only-clone';
      clone.textContent = getInlineTranslationText(inlineEl);
      const lang = inlineEl.getAttribute('lang');
      if (lang) clone.setAttribute('lang', lang);
    }

    const originalWrapper = inlineEl.closest(`[${ORIGINAL_WRAPPER_ATTR}]`);
    if (originalWrapper?.parentElement && needsContainedTranslation(originalWrapper.parentElement)) {
      originalWrapper.after(clone);
    } else {
      parent.after(clone);
    }
    inlineCloneElements.add(clone);
  }
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

  if (!needsContainedTranslation(parentElement)) {
    markOriginalElement(parentElement);
  }

  // Create placeholder (spinner)
  const placeholder = document.createElement('span');
  placeholder.setAttribute(DATA_ATTRS.ROLE, 'translation');
  placeholder.setAttribute(DATA_ATTRS.PIECE_ID, pieceId);
  placeholder.className = 'anyllm-translate-translation anyllm-translate-loading';
  // Accessible status: announce loading state to assistive tech.
  placeholder.setAttribute('role', 'status');
  placeholder.setAttribute('aria-label', 'Translating');

  insertTranslationElement(parentElement, placeholder);
}

/** Apply a single translation relative to its original paragraph.
 * If a loading placeholder already exists for this pieceId, updates it in-place
 * (swaps class, sets text) to avoid layout shift and duplicate elements.
 * @param targetLanguage — ISO code applied as `lang` for accessibility/screen-readers. */
export function applyTranslation(
  parentElement: Element,
  pieceId: string,
  translatedText: string,
  targetLanguage?: string,
): void {
  // Defensive: never mark <body> or <html> as original — that would hide the page
  if (parentElement.tagName === 'BODY' || parentElement.tagName === 'HTML') {
    return;
  }

  if (!needsContainedTranslation(parentElement)) {
    markOriginalElement(parentElement);
  }

  const existing = document.querySelector(`[${DATA_ATTRS.PIECE_ID}="${pieceId}"]`);
  if (existing) {
    // Update placeholder in-place: remove spinner class, set translated text
    existing.classList.remove('anyllm-translate-loading');
    existing.removeAttribute('role');
    existing.removeAttribute('aria-label');
    existing.textContent = translatedText;
    if (targetLanguage) existing.setAttribute('lang', targetLanguage);
    if (!existing.hasAttribute('dir')) existing.setAttribute('dir', 'auto');
    applyMaskA11yIfNeeded(existing as HTMLElement);
    // Re-trigger fade-in animation via rAF to avoid synchronous forced reflow
    restartAnimation(existing as HTMLElement);
    return;
  }

  // No placeholder yet — create translation element (fallback)
  const translationEl = document.createElement('span');
  translationEl.setAttribute(DATA_ATTRS.ROLE, 'translation');
  translationEl.setAttribute(DATA_ATTRS.PIECE_ID, pieceId);
  translationEl.className = 'anyllm-translate-translation';
  translationEl.textContent = translatedText;
  translationEl.setAttribute('dir', 'auto');
  if (targetLanguage) translationEl.setAttribute('lang', targetLanguage);
  applyMaskA11yIfNeeded(translationEl);

  insertTranslationElement(parentElement, translationEl);
}

/** Show a compact inline loading indicator inside parentElement for short pieces.
 *  Idempotent: calling twice for the same pieceId does nothing. */
export function showInlineLoadingPlaceholder(parentElement: Element, pieceId: string): void {
  if (parentElement.tagName === 'BODY' || parentElement.tagName === 'HTML') return;
  if (document.querySelector(`[${DATA_ATTRS.PIECE_ID}="${pieceId}"]`)) return;

  const renderTarget = getInlineRenderTarget(parentElement);

  const placeholder = document.createElement('span');
  placeholder.setAttribute(DATA_ATTRS.PIECE_ID, pieceId);
  placeholder.className = 'anyllm-inline-bilingual anyllm-inline-bilingual-loading';
  // Accessible status text — useful both for screen readers and as a
  // hover tooltip on the inline spinner dot.
  placeholder.setAttribute('role', 'status');
  placeholder.setAttribute('aria-label', 'Translating');

  renderTarget.appendChild(placeholder);

  // Ensure a visible sibling clone exists in translation-only mode where
  // the original (hidden) container would otherwise hide the spinner too.
  syncInlineTranslationOnlySiblings();
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
const constrainedCache = new WeakMap<Element, boolean>();

function isConstrainedContainer(el: Element): boolean {
  const cached = constrainedCache.get(el);
  if (cached !== undefined) return cached;

  // Direct table cell check (fastest path)
  if (el.tagName === 'TD' || el.tagName === 'TH') {
    constrainedCache.set(el, true);
    return true;
  }
  if (el.closest('table')) {
    constrainedCache.set(el, true);
    return true;
  }

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
      constrainedCache.set(el, true);
      return true;
    }
    parent = parent.parentElement;
    depth++;
  }
  constrainedCache.set(el, false);
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

  const renderTarget = getInlineRenderTarget(parentElement);

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
    // Re-trigger animation via rAF to avoid synchronous forced reflow
    restartAnimation(existing as HTMLElement);
    debouncedSyncInlineSiblings();
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

  renderTarget.appendChild(inlineEl);
  debouncedSyncInlineSiblings();
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
    existing.setAttribute('role', 'alert');
    existing.removeAttribute('aria-label');
    (existing as HTMLElement).title = `Translation failed: ${errorMessage}. Click to retry.`;

    if (onRetry) {
      existing.addEventListener('click', () => {
        existing.remove();
        onRetry();
      }, { once: true });
    }
    syncInlineTranslationOnlySiblings();
    return;
  }

  // Fallback — create error element
  const errorEl = document.createElement('span');
  errorEl.setAttribute(DATA_ATTRS.PIECE_ID, pieceId);
  errorEl.className = 'anyllm-inline-bilingual anyllm-inline-bilingual-error';
  errorEl.textContent = ' (⚠ error)';
  errorEl.setAttribute('role', 'alert');
  errorEl.title = `Translation failed: ${errorMessage}. Click to retry.`;

  if (onRetry) {
    errorEl.addEventListener('click', () => {
      errorEl.remove();
      onRetry();
    }, { once: true });
  }

  parentElement.appendChild(errorEl);
  syncInlineTranslationOnlySiblings();
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
    existing.setAttribute('role', 'alert');
    existing.removeAttribute('aria-label');

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
  errorEl.setAttribute('role', 'alert');
  errorEl.textContent = `⚠ Translation failed: ${errorMessage}`;
  errorEl.title = 'Click to retry';

  if (onRetry) {
    errorEl.addEventListener('click', () => {
      clearErrorState(parentElement, pieceId);
      onRetry();
    }, { once: true });
  }

  insertTranslationElement(parentElement, errorEl);
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
  if (!el) return;

  // Determine the associated original element BEFORE removing the translation.
  // Translations may be either a descendant of the marked original (contained
  // elements like <li>/<td>) or a sibling inserted after it (the common case
  // for <p>/<div> blocks via insertAfterTranslationGroup).
  let originalAncestor = el.closest(`[${DATA_ATTRS.TRANSLATED}]`) ?? null;
  if (!originalAncestor) {
    // Sibling case: walk backwards past any translation siblings to find the
    // preceding original element (the paragraph the translation was appended to).
    let prev = el.previousElementSibling;
    while (prev) {
      if (
        prev.getAttribute(DATA_ATTRS.ROLE) === 'translation' ||
        prev.hasAttribute(DATA_ATTRS.PIECE_ID)
      ) {
        prev = prev.previousElementSibling;
        continue;
      }
      if (prev.hasAttribute(DATA_ATTRS.TRANSLATED)) {
        originalAncestor = prev;
      }
      break;
    }
  }

  el.remove();

  // Only clean up the marker on THIS piece's original, and only if no other
  // translation elements remain associated with it. Previously this walked
  // every [TRANSLATED] element on the page and un-marked them all — wiping
  // markers for completely unrelated translations.
  if (!originalAncestor) return;

  // Contained case: original holds translations as descendants.
  const containedRemaining = originalAncestor.querySelectorAll(
    `[${DATA_ATTRS.ROLE}="translation"], [${DATA_ATTRS.PIECE_ID}]`,
  );
  // Sibling case: original is followed by one or more translation siblings.
  let siblingRemaining = false;
  const next = originalAncestor.nextElementSibling;
  while (next) {
    if (
      next.getAttribute(DATA_ATTRS.ROLE) === 'translation' ||
      next.hasAttribute(DATA_ATTRS.PIECE_ID)
    ) {
      siblingRemaining = true;
      break;
    }
    // Stop at the first non-translation sibling (next paragraph, etc.).
    break;
  }

  if (containedRemaining.length === 0 && !siblingRemaining) {
    originalAncestor.removeAttribute(DATA_ATTRS.ROLE);
    originalAncestor.removeAttribute(DATA_ATTRS.TRANSLATED);
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

  removeInlineTranslationOnlyClones();

  // Clean up original markers
  const originals = document.querySelectorAll(`[${DATA_ATTRS.TRANSLATED}]`);
  for (const original of originals) {
    original.removeAttribute(DATA_ATTRS.ROLE);
    original.removeAttribute(DATA_ATTRS.TRANSLATED);
  }

  const wrappers = document.querySelectorAll(`[${ORIGINAL_WRAPPER_ATTR}]`);
  for (const wrapper of wrappers) {
    const parent = wrapper.parentElement;
    if (!parent) continue;
    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper);
    }
    wrapper.remove();
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
  syncInlineTranslationOnlySiblings();
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
