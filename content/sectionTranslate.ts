/**
 * Section Translation — translates a specific DOM section without full-page commitment.
 * Multiple sections can be translated independently.
 */

import type { TranslationPiece } from '@/types/translation';
import { extractPieces } from '@/content/domWalker';
import { applyTranslation, applyTheme, applyPosition, applyDarkMode, setPageState, showLoadingPlaceholder, setErrorState, clearErrorState } from '@/content/translationDisplay';
import { loadSettings } from '@/lib/config';
import { findEffectiveRule, mergeExcludeSelectors } from '@/lib/siteRules';
import { DATA_ATTRS } from '@/lib/constants';

/** Matches translationDisplay's original-wrapper attribute (FR-5). */
const ORIGINAL_WRAPPER_ATTR = 'data-anyllm-original-wrapper';

interface TranslatedSection {
  element: Element;
  pieces: TranslationPiece[];
}

const translatedSections: TranslatedSection[] = [];

/** Retry a single failed piece — shows loading, re-sends to background, applies result or re-shows error */
async function retryPiece(piece: TranslationPiece, settings: Awaited<ReturnType<typeof loadSettings>>): Promise<void> {
  clearErrorState(piece.parentElement, piece.id);
  showLoadingPlaceholder(piece.parentElement, piece.id);

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'translate',
      pieces: [{ id: piece.id, text: piece.text }],
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
    });

    if (response.success && response.results?.length > 0) {
      piece.isTranslated = true;
      piece.translatedText = response.results[0].translatedText;
      applyTranslation(piece.parentElement, piece.id, response.results[0].translatedText);
    } else {
      setErrorState(piece.parentElement, piece.id, response.error ?? 'Retry failed', () => {
        retryPiece(piece, settings);
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Retry failed';
    setErrorState(piece.parentElement, piece.id, message, () => {
      retryPiece(piece, settings);
    });
  }
}

export async function translateSection(element: Element): Promise<void> {
  const settings = await loadSettings();

  // Apply visual settings (needed for theme display)
  applyTheme(settings.theme);
  applyPosition(settings.translationPosition);
  applyDarkMode(settings.darkMode);
  setPageState(settings.displayMode === 'translation-only' ? 'translation-only' : 'dual');

  const hostname = window.location.hostname;
  const matchingRule = findEffectiveRule(hostname, settings.siteRules);
  const effectiveExcludes = mergeExcludeSelectors(
    settings.globalExcludeSelectors ?? [],
    matchingRule?.excludeSelectors,
  );
  const pieces = extractPieces(element, {
    excludeSelectors: effectiveExcludes,
    enableRichTranslate: settings.enableRichTranslate,
    enableAsideCaps: settings.enableAsideCaps,
  });
  if (pieces.length === 0) return;

  translatedSections.push({ element, pieces });

  // Show loading placeholders
  for (const piece of pieces) {
    showLoadingPlaceholder(piece.parentElement, piece.id);
  }

  // Add dismiss button to the section
  addSectionDismissButton(element);

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'translate',
      pieces: pieces.map((p) => ({ id: p.id, text: p.text })),
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
    });

    if (response.success && response.results) {
      for (const result of response.results) {
        const piece = pieces.find((p) => p.id === result.id);
        if (piece) {
          piece.isTranslated = true;
          piece.translatedText = result.translatedText;
          applyTranslation(piece.parentElement, piece.id, result.translatedText);
        }
      }
    } else if (!response.success && response.error) {
      for (const piece of pieces) {
        setErrorState(piece.parentElement, piece.id, response.error ?? 'Unknown error', () => {
          retryPiece(piece, settings);
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    for (const piece of pieces) {
      setErrorState(piece.parentElement, piece.id, message, () => {
        retryPiece(piece, settings);
      });
    }
  }
}

function addSectionDismissButton(sectionEl: Element): void {
  const btn = document.createElement('button');
  btn.setAttribute(DATA_ATTRS.ROLE, 'section-dismiss');
  btn.textContent = '×';
  btn.addEventListener('click', () => {
    removeSectionTranslation(sectionEl);
  });

  // Position at top-right of section
  const wrapper = sectionEl as HTMLElement;
  if (!wrapper.style.position || wrapper.style.position === 'static') {
    wrapper.style.position = 'relative';
  }
  wrapper.appendChild(btn);
}

export function removeSectionTranslation(sectionEl: Element): void {
  // FR-5: mirror removeAllTranslations cleanup scoped to this section so
  // translation-only mode does not leave originals display:none / wrapped.

  // Remove translation elements within this section only
  const translations = sectionEl.querySelectorAll(`[${DATA_ATTRS.ROLE}="translation"]`);
  translations.forEach((el) => el.remove());

  // Sibling translations may sit outside the section element (inserted after
  // a block original). Collect piece ids from marked originals and drop matching
  // following siblings that still carry ROLE=translation or PIECE_ID.
  const markedInSection = sectionEl.querySelectorAll(`[${DATA_ATTRS.TRANSLATED}]`);
  for (const original of markedInSection) {
    let next = original.nextElementSibling;
    while (next) {
      const isTranslationSibling =
        next.getAttribute(DATA_ATTRS.ROLE) === 'translation' ||
        next.hasAttribute(DATA_ATTRS.PIECE_ID) ||
        next.classList.contains('anyllm-inline-bilingual') ||
        next.hasAttribute('data-anyllm-inline-clone-for');
      if (!isTranslationSibling) break;
      const toRemove = next;
      next = next.nextElementSibling;
      toRemove.remove();
    }
  }

  // Remove inline bilingual elements and translation-only clones (siblings of the
  // originals created in translation-only mode). Previously these were missed,
  // leaving orphaned inline translations behind after section removal.
  const inlineBilinguals = sectionEl.querySelectorAll(
    '.anyllm-inline-bilingual, [data-anyllm-inline-clone-for]',
  );
  inlineBilinguals.forEach((el) => el.remove());

  // Remove loading/error placeholders by piece-id (they carry PIECE_ID, not a
  // bogus [role=loading]/[role=error] selector that matched nothing).
  const placeholders = sectionEl.querySelectorAll(
    `[${DATA_ATTRS.PIECE_ID}].anyllm-translate-loading, [${DATA_ATTRS.PIECE_ID}].anyllm-inline-bilingual-loading, [${DATA_ATTRS.PIECE_ID}].anyllm-inline-bilingual-error`,
  );
  placeholders.forEach((el) => el.remove());

  // Remove dismiss button
  const dismissBtn = sectionEl.querySelector(`[${DATA_ATTRS.ROLE}="section-dismiss"]`);
  if (dismissBtn) dismissBtn.remove();

  // Canonical marker cleanup: ROLE=original + TRANSLATED + loading/error attrs
  const marked = sectionEl.querySelectorAll(
    `[${DATA_ATTRS.TRANSLATED}], [${DATA_ATTRS.ROLE}="original"]`,
  );
  marked.forEach((el) => {
    el.removeAttribute(DATA_ATTRS.ROLE);
    el.removeAttribute(DATA_ATTRS.TRANSLATED);
    el.removeAttribute('data-anyllm-loading');
    el.removeAttribute('data-anyllm-error');
  });

  // Unwrap data-anyllm-original-wrapper nodes (same as removeAllTranslations)
  const wrappers = sectionEl.querySelectorAll(`[${ORIGINAL_WRAPPER_ATTR}]`);
  for (const wrapper of wrappers) {
    const parent = wrapper.parentElement;
    if (!parent) continue;
    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper);
    }
    wrapper.remove();
  }

  // Remove from tracking
  const idx = translatedSections.findIndex((s) => s.element === sectionEl);
  if (idx >= 0) translatedSections.splice(idx, 1);
}

export function removeAllSectionTranslations(): void {
  while (translatedSections.length > 0) {
    const section = translatedSections[0];
    removeSectionTranslation(section.element);
  }
}

/**
 * Clear the translated sections array without removing DOM elements.
 * Intended for SPA navigation where the DOM is being replaced anyway,
 * so we only need to reset the tracking array to prevent stale references.
 */
export function clearTranslatedSections(): void {
  translatedSections.length = 0;
}

export function getTranslatedSections(): readonly TranslatedSection[] {
  return translatedSections;
}
