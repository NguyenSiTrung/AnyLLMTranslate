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

async function captureOutline(
  deps: BuildSuggestSiteRuleDeps,
  hostname: string,
  pageUrl: URL,
): Promise<
  | { ok: true; outline: DomOutline; source: SiteRuleSuggestSource; warnings: string[] }
  | { ok: false; error: string }
> {
  try {
    const fromTab = await deps.findOpenTabOutline(hostname, pageUrl);
    if (fromTab) {
      return { ok: true, outline: fromTab, source: 'tab', warnings: [] };
    }
  } catch {
    /* fall through to loadUrl */
  }

  try {
    const loaded = await deps.loadUrlOutline(pageUrl);
    return {
      ok: true,
      outline: loaded.outline,
      source: 'fetch',
      warnings: loaded.warnings ?? [],
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not load page',
    };
  }
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

  const captured = await captureOutline(deps, hostname, pageUrl);
  if (!captured.ok) {
    return { success: false, error: captured.error };
  }

  const { outline, source, warnings: captureWarnings } = captured;
  const base = heuristicDraftFromOutline(outline, source, captureWarnings);

  let raw: string | null;
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
