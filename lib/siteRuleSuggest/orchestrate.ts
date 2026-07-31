/**
 * Pure orchestration for SUGGEST_SITE_RULE (chrome-free for unit tests).
 */

import type { DomOutline, SiteRuleSuggestSource, SuggestSiteRuleDraft } from './types';
import { parseSuggestUrl, hostnameFromUrl } from './url';
import { heuristicDraftFromOutline } from './heuristics';
import { parseSiteRuleSuggestLlmJson } from './prompt';
import { sanitizeDraft } from './sanitize';

export interface SuggestSiteRuleResult {
  success: boolean;
  draft?: SuggestSiteRuleDraft;
  error?: string;
}

export interface BuildSuggestSiteRuleDeps {
  urlInput: string;
  findOpenTabOutline: (hostname: string, pageUrl: URL) => Promise<DomOutline | null>;
  loadUrlOutline: (
    pageUrl: URL,
  ) => Promise<{ outline: DomOutline; warnings: string[] }>;
  /** Raw model text, or null to skip LLM (no key / error). */
  runLlm: (outline: DomOutline) => Promise<string | null>;
}

export async function buildSuggestSiteRuleDraft(
  deps: BuildSuggestSiteRuleDeps,
): Promise<SuggestSiteRuleResult> {
  const parsed = parseSuggestUrl(deps.urlInput);
  if (!parsed.ok) {
    return { success: false, error: parsed.error };
  }

  const pageUrl = parsed.url;
  const hostname = hostnameFromUrl(pageUrl);

  let outline: DomOutline | null = null;
  let source: SiteRuleSuggestSource = 'tab';
  let captureWarnings: string[] = [];

  try {
    outline = await deps.findOpenTabOutline(hostname, pageUrl);
  } catch {
    outline = null;
  }

  if (!outline) {
    source = 'fetch';
    try {
      const loaded = await deps.loadUrlOutline(pageUrl);
      outline = loaded.outline;
      captureWarnings = loaded.warnings ?? [];
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Could not load page',
      };
    }
  }

  if (!outline) {
    return { success: false, error: 'Could not read page structure' };
  }

  const base = heuristicDraftFromOutline(outline, source, captureWarnings);

  let raw: string | null = null;
  try {
    raw = await deps.runLlm(outline);
  } catch {
    raw = null;
  }

  if (!raw) {
    return { success: true, draft: base };
  }

  const llmPartial = parseSiteRuleSuggestLlmJson(raw);
  if (!llmPartial) {
    return { success: true, draft: base };
  }

  const draft = sanitizeDraft(
    {
      ...llmPartial,
      source,
      warnings: captureWarnings,
    },
    base,
  );

  const llmUseful =
    (draft.includeSelectors?.length ?? 0) > 0 ||
    (draft.excludeSelectors?.length ?? 0) > 0;

  // If LLM produced usable selectors, drop heuristic_only.
  // sanitizeDraft may have filled includes from fallback — check whether
  // LLM itself contributed any valid selectors.
  const llmIncludes = Array.isArray(llmPartial.includeSelectors)
    ? llmPartial.includeSelectors.length
    : 0;
  const llmExcludes = Array.isArray(llmPartial.excludeSelectors)
    ? llmPartial.excludeSelectors.length
    : 0;
  const llmHadSelectors = llmIncludes + llmExcludes > 0;

  if (llmUseful && llmHadSelectors) {
    draft.warnings = (draft.warnings ?? []).filter((w) => w !== 'heuristic_only');
    if (draft.warnings.length === 0) delete draft.warnings;
  }

  return { success: true, draft };
}
