/**
 * Shared auto-detected category state.
 *
 * Both entrypoints/content.ts (page translation) and content/subtitleCoordinator.ts
 * (subtitle translation) run LLM category detection independently. Since they share
 * one content-script context and the popup queries content.ts via getPageCategory,
 * this singleton lets subtitle-page detection reach the popup too.
 */

import type { ExtensionSettings } from '@/types/config';
import type { CategoryInfo } from '@/types/messages';
import { resolveCategory } from '@/content/utils/pageContext';
import { findMatchingRule } from '@/lib/siteRules';

let autoDetectedCategory: string | undefined;

/** Get the current auto-detected category (LLM or heuristic). */
export function getAutoDetectedCategory(): string | undefined {
  return autoDetectedCategory;
}

/** Set the auto-detected category (called from detection callbacks). */
export function setAutoDetectedCategory(category: string | undefined): void {
  autoDetectedCategory = category;
}

/**
 * Build the full CategoryInfo using the priority chain:
 * override > siteRule > autoDetected.
 */
export function buildCategoryInfo(
  settings: ExtensionSettings,
  tabOverride: string | undefined,
): CategoryInfo {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const matchingRule = findMatchingRule(hostname, settings.siteRules ?? []);
  const autoDetected = autoDetectedCategory;
  const siteRule = matchingRule?.category;
  const effective = resolveCategory(autoDetected, siteRule, tabOverride);
  return { autoDetected, siteRule, override: tabOverride, effective };
}

/** Broadcast current category info to the popup for live refresh. */
export function broadcastCategoryInfo(
  settings: ExtensionSettings,
  tabOverride: string | undefined,
): void {
  const categoryInfo = buildCategoryInfo(settings, tabOverride);
  chrome.runtime
    .sendMessage({ action: 'pageCategoryUpdate', categoryInfo })
    .catch(() => {
      /* popup may not be open */
    });
}

/** Reset all state (for testing). */
export function _resetCategoryState(): void {
  autoDetectedCategory = undefined;
}
