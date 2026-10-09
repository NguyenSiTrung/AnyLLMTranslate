/**
 * Translation Display — injects bilingual translations into the DOM.
 * Supports 16+ visual themes and translation positioning.
 */

import { DATA_ATTRS } from '@/lib/constants';
import { scheduleDomWrite } from '@/lib/performance';
import { decodeInlineHtml } from '@/lib/richTranslate';
import { getRegisteredShadowRoots, syncShadowHostState } from './shadowDomRoots';
import type { RichVariable } from '@/lib/richTranslate';
import type { PageState } from '@/lib/constants';
import type { ThemeName, TranslationPosition, DarkMode, DisplayMode, CustomThemeConfig } from '@/types/config';

/** Legacy (pre-FR-7) wrapper that older builds moved LI/TD/TH children into.
 *  Only cleanup paths still look for it, so translated pages restore. */
const ORIGINAL_WRAPPER_ATTR = 'data-anyllm-original-wrapper';
/** FR-7: marks an LI/TD/TH that holds its translation as a child. CSS hides
 *  its source in translation-only mode without moving any site node. */
const CONTAINED_ATTR = 'data-anyllm-contained';
/** FR-7: the host's own font size, captured before translation-only CSS sets
 *  it to 0 (bare text children cannot be hidden by a selector). */
const HOST_FONT_VAR = '--anyllm-host-font-size';
const INLINE_CLONE_ATTR = 'data-anyllm-inline-clone-for';

/** Track all inline-translation-only clone elements for O(1) removal
 *  instead of querySelectorAll on every sync. */
const inlineCloneElements = new Set<HTMLElement>();

/**
 * FR-10 / FR-29: piece-id → live translation element map (avoids document-wide
 * querySelector on every update). Cleared on full remove.
 */
const pieceElements = new Map<string, HTMLElement>();

/** Safe CSS.escape for piece-id attribute selectors (FR-29). */
function escapePieceId(pieceId: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(pieceId);
  }
  return pieceId.replace(/["\\]/g, '\\$&');
}

/** FR-23: document plus every registered open shadow root — the scope for
 *  display lookups and cleanup queries. */
function displayScopes(): ParentNode[] {
  return [document, ...getRegisteredShadowRoots()];
}

/** sm7n: extension-injected artifact nodes — translations, placeholders,
 *  error chips, inline bilinguals/clones, and owned UI. */
const ARTIFACT_SELECTOR =
  `[${DATA_ATTRS.ROLE}="translation"], [${DATA_ATTRS.PIECE_ID}], ` +
  `[${DATA_ATTRS.OWNED}], .anyllm-inline-bilingual, ` +
  `.anyllm-inline-translation-only-clone`;

/** sm7n: element carries the marked-original state. */
function isMarkedOriginal(el: Element): boolean {
  return (
    el.hasAttribute(DATA_ATTRS.TRANSLATED) ||
    el.getAttribute(DATA_ATTRS.ROLE) === 'original'
  );
}

function isArtifactElement(el: Element): boolean {
  return el.matches(ARTIFACT_SELECTOR);
}

/**
 * sm7n: the marked original that OWNS an artifact element. A translation is
 * owned by the nearest marked original it directly follows (sibling case —
 * skipping other artifacts of the same original) or, when no marked sibling
 * precedes it, by the marked ancestor that contains it (contained case).
 * Crucially, an artifact sitting after a nested marked original belongs to
 * that nested original — not to an outer marked element that merely
 * contains both.
 */
function ownerOriginalFor(el: Element): Element | null {
  let node: Element | null = el;
  while (node) {
    let sib = node.previousElementSibling;
    while (sib) {
      if (isMarkedOriginal(sib)) return sib;
      if (!isArtifactElement(sib)) break;
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
    if (node && isMarkedOriginal(node)) return node;
  }
  return null;
}

/** sm7n: does `original` still own any artifact — a contained descendant
 *  owned by it, or an artifact sibling directly after it. */
function hasOwnedArtifacts(original: Element): boolean {
  for (const artifact of original.querySelectorAll(ARTIFACT_SELECTOR)) {
    if (ownerOriginalFor(artifact) === original) return true;
  }
  let sib = original.nextElementSibling;
  while (sib && isArtifactElement(sib)) {
    if (ownerOriginalFor(sib) === original) return true;
    sib = sib.nextElementSibling;
  }
  return false;
}

/** FR-29: look up a piece element by id (map first, then escaped query). */
export function findPieceElement(
  pieceId: string,
  root: ParentNode = document,
): HTMLElement | null {
  const mapped = pieceElements.get(pieceId);
  if (mapped && mapped.isConnected) return mapped;
  if (mapped) pieceElements.delete(pieceId);
  const selector = `[${DATA_ATTRS.PIECE_ID}="${escapePieceId(pieceId)}"]`;
  const scopes = root === document ? displayScopes() : [root];
  for (const scope of scopes) {
    const el = scope.querySelector(selector);
    if (el instanceof HTMLElement) return el;
  }
  return null;
}

function trackPieceElement(pieceId: string, el: HTMLElement): void {
  pieceElements.set(pieceId, el);
}

function untrackPieceElement(pieceId: string): void {
  pieceElements.delete(pieceId);
}

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
  const translations = displayScopes().flatMap((scope) =>
    Array.from(scope.querySelectorAll<HTMLElement>(`.anyllm-translate-translation`)),
  );
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
  // Scoped styles use :host(...) — the host carries the theme attribute.
  syncShadowHostState();
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
  syncShadowHostState();
}

/** Apply dark mode class to document root */
export function applyDarkMode(mode: DarkMode): void {
  if (mode === 'dark') {
    document.documentElement.classList.add('anyllm-dark');
  } else {
    document.documentElement.classList.remove('anyllm-dark');
  }
  // 'auto' mode relies on CSS @media (prefers-color-scheme: dark) — no class needed
  syncShadowHostState();
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

/** FR-7: record the host's computed font size for the translation-only rules. */
function captureHostFontSize(host: Element): void {
  if (!(host instanceof HTMLElement) || host.style.getPropertyValue(HOST_FONT_VAR)) return;
  const fontSize = host.ownerDocument.defaultView?.getComputedStyle(host).fontSize;
  if (fontSize && fontSize !== '0px') host.style.setProperty(HOST_FONT_VAR, fontSize);
}

/**
 * FR-7: mark an LI/TD/TH as the original in place. Its children are never
 * moved — frameworks (React) hold references and call
 * `parent.removeChild(child)`, which throws once a child is re-parented.
 */
function markContainedHost(host: Element): void {
  if (!host.hasAttribute(CONTAINED_ATTR)) {
    // Read the size before the marker lets translation-only CSS zero it.
    if (getPageState() === 'translation-only') captureHostFontSize(host);
    host.setAttribute(CONTAINED_ATTR, '');
  }
  markOriginalElement(host);
}

/** Clear every original marker (and the FR-7 contained state) from `el`. */
function unmarkOriginal(el: Element): void {
  el.removeAttribute(DATA_ATTRS.ROLE);
  el.removeAttribute(DATA_ATTRS.TRANSLATED);
  if (!el.hasAttribute(CONTAINED_ATTR)) return;
  el.removeAttribute(CONTAINED_ATTR);
  if (el instanceof HTMLElement) {
    el.style.removeProperty(HOST_FONT_VAR);
    if (el.getAttribute('style') === '') el.removeAttribute('style');
  }
}

/** Unwrap a legacy original wrapper, restoring its children to the parent. */
function unwrapLegacyWrapper(wrapper: Element): void {
  const parent = wrapper.parentElement;
  if (!parent) return;
  while (wrapper.firstChild) {
    parent.insertBefore(wrapper.firstChild, wrapper);
  }
  wrapper.remove();
}

function insertIntoContainedElement(parentElement: Element, translationEl: HTMLElement): void {
  markContainedHost(parentElement);
  if (isAbovePosition()) {
    parentElement.insertBefore(translationEl, parentElement.firstChild);
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
    markContainedHost(parentElement);
  } else {
    markOriginalElement(parentElement);
  }
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

  for (const scope of displayScopes()) {
    const inlineTranslations = scope.querySelectorAll(`.anyllm-inline-bilingual[${DATA_ATTRS.PIECE_ID}]`);
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

      // FR-7: a contained host stays visible (only its source is hidden), so
      // the clone sits inside it, right after the hidden inline element.
      if (parent.hasAttribute(CONTAINED_ATTR)) {
        inlineEl.after(clone);
      } else {
        parent.after(clone);
      }
      inlineCloneElements.add(clone);
    }
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
  if (findPieceElement(pieceId)) {
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
  trackPieceElement(pieceId, placeholder);
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
  variables?: RichVariable[],
): void {
  // Defensive: never mark <body> or <html> as original — that would hide the page
  if (parentElement.tagName === 'BODY' || parentElement.tagName === 'HTML') {
    return;
  }

  if (!needsContainedTranslation(parentElement)) {
    markOriginalElement(parentElement);
  }

  // Rich translate: reconstruct inline markup from `<z id="N">` tokens into a
  // safe DocumentFragment (createElement only, never innerHTML) (FR-1).
  const contentNode: Node = variables && variables.length > 0
    ? decodeInlineHtml(translatedText, variables)
    : document.createTextNode(translatedText);

  const existing = findPieceElement(pieceId);
  if (existing) {
    // Update placeholder in-place: remove spinner class, set translated content
    existing.classList.remove('anyllm-translate-loading');
    existing.removeAttribute('role');
    existing.removeAttribute('aria-label');
    existing.replaceChildren(contentNode.cloneNode(true));
    if (targetLanguage) existing.setAttribute('lang', targetLanguage);
    if (!existing.hasAttribute('dir')) existing.setAttribute('dir', 'auto');
    applyMaskA11yIfNeeded(existing);
    // Re-trigger fade-in animation via rAF to avoid synchronous forced reflow
    restartAnimation(existing);
    trackPieceElement(pieceId, existing);
    return;
  }

  // No placeholder yet — create translation element (fallback)
  const translationEl = document.createElement('span');
  translationEl.setAttribute(DATA_ATTRS.ROLE, 'translation');
  translationEl.setAttribute(DATA_ATTRS.PIECE_ID, pieceId);
  translationEl.className = 'anyllm-translate-translation';
  translationEl.appendChild(contentNode.cloneNode(true));
  translationEl.setAttribute('dir', 'auto');
  if (targetLanguage) translationEl.setAttribute('lang', targetLanguage);
  applyMaskA11yIfNeeded(translationEl);

  insertTranslationElement(parentElement, translationEl);
  trackPieceElement(pieceId, translationEl);
}

/** Show a compact inline loading indicator inside parentElement for short pieces.
 *  Idempotent: calling twice for the same pieceId does nothing. */
export function showInlineLoadingPlaceholder(parentElement: Element, pieceId: string): void {
  if (parentElement.tagName === 'BODY' || parentElement.tagName === 'HTML') return;
  if (findPieceElement(pieceId)) return;

  const renderTarget = getInlineRenderTarget(parentElement);

  const placeholder = document.createElement('span');
  placeholder.setAttribute(DATA_ATTRS.PIECE_ID, pieceId);
  placeholder.className = 'anyllm-inline-bilingual anyllm-inline-bilingual-loading';
  // Accessible status text — useful both for screen readers and as a
  // hover tooltip on the inline spinner dot.
  placeholder.setAttribute('role', 'status');
  placeholder.setAttribute('aria-label', 'Translating');

  renderTarget.appendChild(placeholder);
  trackPieceElement(pieceId, placeholder);

  // Ensure a visible sibling clone exists in translation-only mode where
  // the original (hidden) container would otherwise hide the spinner too.
  // FR-8: debounced — each pass rebuilds every clone, so N placeholders would
  // otherwise cost O(N²).
  debouncedSyncInlineSiblings();
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
  variables?: RichVariable[],
): void {
  if (parentElement.tagName === 'BODY' || parentElement.tagName === 'HTML') return;

  const renderTarget = getInlineRenderTarget(parentElement);

  const translationOnly = isTranslationOnlyMode();
  const constrained = isConstrainedContainer(parentElement);

  // Rich translate: when variables are present, decode inline markup into a
  // DocumentFragment and render that (skipping the plain-text parenthetical
  // wrap, which doesn't compose with reconstructed elements) (FR-1).
  const hasRichVars = variables && variables.length > 0;

  const buildContent = (): Node => {
    if (hasRichVars && variables) {
      return decodeInlineHtml(translatedText, variables);
    }
    return document.createTextNode(formatInlineText(translatedText, translationOnly));
  };

  const existing = findPieceElement(pieceId);
  if (existing) {
    // Update inline placeholder in-place
    existing.classList.remove('anyllm-inline-bilingual-loading');
    if (constrained) existing.classList.add('anyllm-inline-constrained');
    existing.replaceChildren(buildContent().cloneNode(true));
    // Accessibility: set lang for screen readers and title for hover tooltip
    if (targetLanguage) existing.setAttribute('lang', targetLanguage);
    existing.title = translatedText;
    if (!existing.hasAttribute('dir')) existing.setAttribute('dir', 'auto');
    // Re-trigger animation via rAF to avoid synchronous forced reflow
    restartAnimation(existing);
    trackPieceElement(pieceId, existing);
    debouncedSyncInlineSiblings();
    return;
  }

  // No placeholder — create inline translation element
  const inlineEl = document.createElement('span');
  inlineEl.setAttribute(DATA_ATTRS.PIECE_ID, pieceId);
  inlineEl.className = constrained
    ? 'anyllm-inline-bilingual anyllm-inline-constrained'
    : 'anyllm-inline-bilingual';
  inlineEl.appendChild(buildContent());
  inlineEl.setAttribute('dir', 'auto');
  // Accessibility: lang attribute for correct pronunciation, title for hover
  if (targetLanguage) inlineEl.setAttribute('lang', targetLanguage);
  inlineEl.title = translatedText;

  renderTarget.appendChild(inlineEl);
  trackPieceElement(pieceId, inlineEl);
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

  const existing = findPieceElement(pieceId);
  if (existing) {
    existing.classList.remove('anyllm-inline-bilingual-loading');
    existing.classList.add('anyllm-inline-bilingual-error');
    existing.textContent = ' (⚠ error)';
    existing.setAttribute('role', 'alert');
    existing.removeAttribute('aria-label');
    existing.title = `Translation failed: ${errorMessage}. Click to retry.`;

    if (onRetry) {
      // FR-25: keyboard-operable retry
      if (!existing.hasAttribute('tabindex')) existing.setAttribute('tabindex', '0');
      const runRetry = () => {
        existing.remove();
        untrackPieceElement(pieceId);
        onRetry();
      };
      existing.addEventListener('click', runRetry, { once: true });
      existing.addEventListener(
        'keydown',
        (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            runRetry();
          }
        },
        { once: true },
      );
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
    if (!errorEl.hasAttribute('tabindex')) errorEl.setAttribute('tabindex', '0');
    const runRetry = () => {
      errorEl.remove();
      untrackPieceElement(pieceId);
      onRetry();
    };
    errorEl.addEventListener('click', runRetry, { once: true });
    errorEl.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          runRetry();
        }
      },
      { once: true },
    );
  }

  parentElement.appendChild(errorEl);
  trackPieceElement(pieceId, errorEl);
  syncInlineTranslationOnlySiblings();
}

function attachRetryHandlers(
  el: HTMLElement,
  pieceId: string,
  onRetry: () => void,
  clearFirst: boolean,
  parentElement?: Element,
): void {
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
  const runRetry = () => {
    if (clearFirst && parentElement) {
      clearErrorState(parentElement, pieceId);
    } else {
      el.remove();
      untrackPieceElement(pieceId);
    }
    onRetry();
  };
  el.addEventListener('click', runRetry, { once: true });
  el.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        runRetry();
      }
    },
    { once: true },
  );
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

  // Compact visible label — full error lives in the title so a batch/pool
  // failure does not flood bilingual view with the same long sentence N times.
  const compactLabel = '⚠ Translation failed';
  const fullTitle = `${errorMessage}. Click to retry.`;

  const existing = findPieceElement(pieceId);
  if (existing) {
    // Update placeholder in-place: swap loading class for error state
    existing.classList.remove('anyllm-translate-loading');
    existing.setAttribute('data-anyllm-error', '');
    existing.textContent = compactLabel;
    existing.setAttribute('title', fullTitle);
    existing.setAttribute('role', 'alert');
    existing.removeAttribute('aria-label');
    trackPieceElement(pieceId, existing);

    if (onRetry) {
      attachRetryHandlers(existing, pieceId, onRetry, true, parentElement);
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
  errorEl.textContent = compactLabel;
  errorEl.title = fullTitle;

  if (onRetry) {
    attachRetryHandlers(errorEl, pieceId, onRetry, true, parentElement);
  }
  trackPieceElement(pieceId, errorEl);

  insertTranslationElement(parentElement, errorEl);
}

/** Clear error state from an element */
export function clearErrorState(parentElement: Element, pieceId: string): void {
  parentElement.removeAttribute('data-anyllm-error');
  const existing = findPieceElement(pieceId);
  if (existing) {
    existing.remove();
    untrackPieceElement(pieceId);
  }
}

/** Remove a single translation by piece ID */
export function removeTranslation(pieceId: string): void {
  const el = findPieceElement(pieceId);
  if (!el) return;
  untrackPieceElement(pieceId);

  // Determine the marked original that OWNS this element BEFORE removing it.
  // Translations may be either a descendant of the marked original (contained
  // elements like <li>/<td>) or a sibling inserted after it (the common case
  // for <p>/<div> blocks via insertAfterTranslationGroup). Ownership — not
  // mere containment — matters: an artifact after a nested marked original
  // belongs to that nested original, not an outer marked ancestor (sm7n).
  const originalAncestor = ownerOriginalFor(el);

  el.remove();

  // Only clean up the marker on THIS piece's original, and only if no other
  // translation elements remain associated with it. Previously this walked
  // every [TRANSLATED] element on the page and un-marked them all — wiping
  // markers for completely unrelated translations.
  if (!originalAncestor) return;
  if (!hasOwnedArtifacts(originalAncestor)) {
    unmarkOriginal(originalAncestor);
  }
}

/**
 * sm7n: remove one piece's output/placeholder/inline clone and restore only
 * the affected original — markers are cleared by removeTranslation when no
 * artifacts remain, the contained original wrapper is unwrapped, and
 * transient loading/error attrs are stripped. Never touches other pieces.
 */
export function removePieceArtifacts(pieceId: string, parentElement: Element): void {
  // Translation-only sibling clones sit OUTSIDE the original — drop the
  // clone tracked for this piece.
  for (const clone of [...inlineCloneElements]) {
    if (clone.getAttribute(INLINE_CLONE_ATTR) === pieceId) {
      clone.remove();
      inlineCloneElements.delete(clone);
    }
  }

  removeTranslation(pieceId);

  // The site may have already removed the piece element itself (e.g. a
  // textContent replacement) — findPieceElement then returns null and
  // removeTranslation is a no-op. Clear the parent's markers once no
  // artifacts owned by it remain so the group can be re-extracted, while
  // artifacts owned by a nested marked original keep that original marked.
  if (isMarkedOriginal(parentElement) && !hasOwnedArtifacts(parentElement)) {
    unmarkOriginal(parentElement);
  }

  // Legacy contained case (pre-FR-7 builds): unwrap the original wrapper once
  // no artifacts remain inside it, restoring raw source children to the parent.
  const wrapper = parentElement.querySelector(`:scope > [${ORIGINAL_WRAPPER_ATTR}]`);
  if (
    wrapper &&
    !wrapper.querySelector(
      `[${DATA_ATTRS.ROLE}="translation"], [${DATA_ATTRS.PIECE_ID}], .anyllm-inline-bilingual`,
    )
  ) {
    unwrapLegacyWrapper(wrapper);
  }

  // Transient loading/error state attrs on the original itself.
  parentElement.removeAttribute('data-anyllm-loading');
  parentElement.removeAttribute('data-anyllm-error');
}

/** Remove all translations from the page */
export function removeAllTranslations(): void {
  for (const scope of displayScopes()) {
    // Remove all translation elements (block-level)
    const translations = scope.querySelectorAll(`[${DATA_ATTRS.ROLE}="translation"]`);
    for (const el of translations) {
      el.remove();
    }

    // Remove all inline bilingual elements (parenthetical style)
    const inlineBilinguals = scope.querySelectorAll('.anyllm-inline-bilingual');
    for (const el of inlineBilinguals) {
      el.remove();
    }

    // Clean up original markers (and FR-7 contained hosts)
    const originals = scope.querySelectorAll(`[${DATA_ATTRS.TRANSLATED}], [${CONTAINED_ATTR}]`);
    for (const original of originals) {
      unmarkOriginal(original);
    }

    // Pages translated by pre-FR-7 builds still carry original wrappers.
    for (const wrapper of scope.querySelectorAll(`[${ORIGINAL_WRAPPER_ATTR}]`)) {
      unwrapLegacyWrapper(wrapper);
    }

    // Clean up loading/error states on original elements (legacy data-anyllm-loading)
    const loadingEls = scope.querySelectorAll('[data-anyllm-loading]');
    for (const el of loadingEls) {
      el.removeAttribute('data-anyllm-loading');
    }
    const errorEls = scope.querySelectorAll('[data-anyllm-error]');
    for (const el of errorEls) {
      el.removeAttribute('data-anyllm-error');
    }
  }

  pieceElements.clear();
  removeInlineTranslationOnlyClones();

  // Reset page state
  setPageState('off');
}

/** Set the page translation state */
export function setPageState(state: PageState): void {
  // FR-7: capture contained-host font sizes in one read pass before the
  // translation-only rules zero them.
  if (state === 'translation-only' && getPageState() !== 'translation-only') {
    for (const scope of displayScopes()) {
      scope.querySelectorAll(`[${CONTAINED_ATTR}]`).forEach(captureHostFontSize);
    }
  }
  document.documentElement.setAttribute(DATA_ATTRS.STATE, state);
  syncShadowHostState();
  syncInlineTranslationOnlySiblings();
}

/** Number of piece elements in the lookup map (tests, FR-13). */
export const __pieceElementCountForTest = (): number => pieceElements.size;

/** Run the translation-only inline clone sync synchronously (tests). */
export const __syncInlineSiblingsForTest = syncInlineTranslationOnlySiblings;

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
