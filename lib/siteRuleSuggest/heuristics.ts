/**
 * Local heuristic draft from a DOM outline (no LLM).
 */

import type { DomOutline, DomOutlineNode, SiteRuleSuggestSource, SuggestSiteRuleDraft } from './types';
import { preferHostnamePattern } from './url';

const INCLUDE_TAGS = new Set(['main', 'article', 'section']);
const EXCLUDE_TAGS = new Set(['nav', 'aside', 'footer', 'header', 'pre', 'code']);
const SIDEBAR_CLASS_RE = /sidebar|sidenav|toc|breadcrumb|navbox|infobox|menu/i;

function selectorFor(node: DomOutlineNode): string {
  if (node.id) return `#${node.id}`;
  if (node.classes && node.classes.length > 0) {
    const cls = node.classes.slice(0, 2).map((c) => `.${c}`).join('');
    return `${node.tag}${cls}`;
  }
  if (node.role) return `${node.tag}[role="${node.role}"]`;
  return node.tag;
}

function pushUnique(list: string[], sel: string, max: number): void {
  if (list.length >= max) return;
  if (!sel || list.includes(sel)) return;
  list.push(sel);
}

/**
 * Build a basic site-rule draft from outline structure.
 * Always tags warnings with `heuristic_only`.
 */
export function heuristicDraftFromOutline(
  outline: DomOutline,
  source: SiteRuleSuggestSource,
  extraWarnings: string[] = [],
): SuggestSiteRuleDraft {
  const includeSelectors: string[] = [];
  const excludeSelectors: string[] = [];

  const sorted = [...outline.nodes].sort((a, b) => b.textLength - a.textLength);

  for (const node of sorted) {
    const isInclude =
      INCLUDE_TAGS.has(node.tag) ||
      node.role === 'main' ||
      (node.classes ?? []).some((c) => /content|post|markdown|prose|article/i.test(c));
    if (isInclude) {
      pushUnique(includeSelectors, selectorFor(node), 8);
    }
  }

  // Fall back to largest text-ish nodes if no semantic includes
  if (includeSelectors.length === 0) {
    for (const node of sorted) {
      if (node.textLength < 40) continue;
      if (EXCLUDE_TAGS.has(node.tag)) continue;
      pushUnique(includeSelectors, selectorFor(node), 5);
    }
  }

  for (const node of outline.nodes) {
    const sidebarish = (node.classes ?? []).some((c) => SIDEBAR_CLASS_RE.test(c));
    const isExclude =
      EXCLUDE_TAGS.has(node.tag) ||
      node.role === 'navigation' ||
      node.role === 'complementary' ||
      sidebarish;
    if (isExclude) {
      pushUnique(excludeSelectors, selectorFor(node), 8);
    }
  }

  const warnings = Array.from(
    new Set(['heuristic_only', ...extraWarnings.filter(Boolean)]),
  );

  return {
    hostname: preferHostnamePattern(outline.hostname),
    includeSelectors,
    excludeSelectors,
    source,
    warnings,
  };
}
