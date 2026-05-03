/**
 * Section Translation — translates a specific DOM section without full-page commitment.
 * Multiple sections can be translated independently.
 */

import type { TranslationPiece } from '@/types/translation';
import { extractPieces } from '@/content/domWalker';
import { applyTranslation, applyTheme, applyPosition, applyDarkMode, setPageState, showLoadingPlaceholder, setErrorState } from '@/content/translationDisplay';
import { loadSettings } from '@/lib/config';
import { findEffectiveRule, mergeExcludeSelectors } from '@/lib/siteRules';
import { DATA_ATTRS } from '@/lib/constants';

interface TranslatedSection {
  element: Element;
  pieces: TranslationPiece[];
}

const translatedSections: TranslatedSection[] = [];

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
        setErrorState(piece.parentElement, piece.id, response.error ?? 'Unknown error');
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    for (const piece of pieces) {
      setErrorState(piece.parentElement, piece.id, message);
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
  // Remove translation elements within this section only
  const translations = sectionEl.querySelectorAll(`[${DATA_ATTRS.ROLE}="translation"]`);
  translations.forEach((el) => el.remove());

  // Remove loading/error placeholders
  const placeholders = sectionEl.querySelectorAll(`[${DATA_ATTRS.ROLE}="loading"], [${DATA_ATTRS.ROLE}="error"]`);
  placeholders.forEach((el) => el.remove());

  // Remove dismiss button
  const dismissBtn = sectionEl.querySelector(`[${DATA_ATTRS.ROLE}="section-dismiss"]`);
  if (dismissBtn) dismissBtn.remove();

  // Remove translated markers
  const marked = sectionEl.querySelectorAll(`[${DATA_ATTRS.TRANSLATED}]`);
  marked.forEach((el) => el.removeAttribute(DATA_ATTRS.TRANSLATED));

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

export function getTranslatedSections(): readonly TranslatedSection[] {
  return translatedSections;
}
