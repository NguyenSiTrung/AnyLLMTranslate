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

/** How the current auto-detected value was obtained. */
export type AutoCategorySource = 'domain' | 'heuristic' | 'llm' | 'cache';

let autoDetectedCategory: string | undefined;
let autoDetectedSource: AutoCategorySource | undefined;
let categoryDetectionInFlight = false;
/** URL snapshot used to invalidate stale SPA categories. */
let categoryBoundUrl: string | undefined;

function currentPageUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
}

/** Get the current auto-detected category (LLM or heuristic). */
export function getAutoDetectedCategory(): string | undefined {
  return autoDetectedCategory;
}

/** Source of the current auto-detected category, if any. */
export function getAutoDetectedSource(): AutoCategorySource | undefined {
  return autoDetectedSource;
}

/**
 * Set the auto-detected category (called from detection callbacks).
 * `source` defaults to `'llm'` for backward-compatible call sites.
 */
export function setAutoDetectedCategory(
  category: string | undefined,
  source: AutoCategorySource = 'llm',
): void {
  autoDetectedCategory = category;
  autoDetectedSource = category ? source : undefined;
  categoryBoundUrl = category ? currentPageUrl() : undefined;
}

/** Whether an LLM category detection call is currently in progress. */
export function isCategoryDetectionInFlight(): boolean {
  return categoryDetectionInFlight;
}

/** Mark LLM category detection as in-progress (or clear it). */
export function setCategoryDetectionInFlight(v: boolean): void {
  categoryDetectionInFlight = v;
}

/**
 * Clear auto-detected category when the page URL has changed (SPA navigation).
 * Returns true when state was invalidated.
 */
export function invalidateCategoryIfUrlChanged(): boolean {
  const url = currentPageUrl();
  if (!autoDetectedCategory) {
    categoryBoundUrl = url || categoryBoundUrl;
    return false;
  }
  if (categoryBoundUrl === undefined) {
    categoryBoundUrl = url;
    return false;
  }
  if (categoryBoundUrl === url) return false;
  autoDetectedCategory = undefined;
  autoDetectedSource = undefined;
  categoryDetectionInFlight = false;
  categoryBoundUrl = url;
  return true;
}

/**
 * True when a locked source should skip further LLM detection
 * (domain map hit, prior LLM/cache result). Weak heuristics do not lock.
 */
export function isAutoCategoryLocked(): boolean {
  if (!autoDetectedCategory || !autoDetectedSource) return false;
  return autoDetectedSource === 'domain' || autoDetectedSource === 'llm' || autoDetectedSource === 'cache';
}

/**
 * Build the full CategoryInfo using the priority chain:
 * override > siteRule > autoDetected.
 */
export function buildCategoryInfo(
  settings: ExtensionSettings,
  tabOverride: string | undefined,
): CategoryInfo {
  invalidateCategoryIfUrlChanged();
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
  autoDetectedSource = undefined;
  categoryDetectionInFlight = false;
  categoryBoundUrl = undefined;
}
