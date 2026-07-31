/**
 * Prompts and JSON parse for LLM site-rule suggestions.
 */

import type { DomOutline, SuggestSiteRuleDraft } from './types';

export function buildSiteRuleSuggestSystemPrompt(): string {
  return [
    'You help configure a browser translation extension site rule.',
    'Given a compact DOM outline, suggest CSS selectors for what to translate and what to skip.',
    'Return ONLY a JSON object with keys:',
    '  hostname (string),',
    '  includeSelectors (string[]),',
    '  excludeSelectors (string[]),',
    '  alwaysTranslate (optional boolean),',
    '  neverTranslate (optional boolean),',
    '  category (optional string),',
    '  rationale (optional short string).',
    'Prefer stable semantic selectors (tags, roles, short ids/classes).',
    'Avoid ephemeral hashed CSS module classes when better alternatives exist.',
    'includeSelectors = main readable content; excludeSelectors = chrome/nav/sidebars/code.',
    'hostname must be an exact host or *.domain.tld pattern for this site only.',
    'Do not invent unrelated hosts. No markdown, no commentary, JSON only.',
  ].join('\n');
}

export function buildSiteRuleSuggestUserPrompt(outline: DomOutline): string {
  const payload = {
    url: outline.url,
    hostname: outline.hostname,
    title: outline.title,
    nodes: outline.nodes,
  };
  return [
    'Suggest a site translation rule for this page outline.',
    'Outline JSON:',
    JSON.stringify(payload),
  ].join('\n');
}

function stripFences(raw: string): string {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(s);
  if (fence) s = fence[1].trim();
  return s;
}

/**
 * Parse model output into a partial draft. Returns null on garbage.
 */
export function parseSiteRuleSuggestLlmJson(
  raw: string,
): Partial<SuggestSiteRuleDraft> | null {
  if (!raw || typeof raw !== 'string') return null;
  const text = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Try to extract first {...} block
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  const out: Partial<SuggestSiteRuleDraft> = {};
  if (typeof obj.hostname === 'string') out.hostname = obj.hostname;
  if (Array.isArray(obj.includeSelectors)) {
    out.includeSelectors = obj.includeSelectors.filter(
      (x): x is string => typeof x === 'string',
    );
  }
  if (Array.isArray(obj.excludeSelectors)) {
    out.excludeSelectors = obj.excludeSelectors.filter(
      (x): x is string => typeof x === 'string',
    );
  }
  if (typeof obj.alwaysTranslate === 'boolean') out.alwaysTranslate = obj.alwaysTranslate;
  if (typeof obj.neverTranslate === 'boolean') out.neverTranslate = obj.neverTranslate;
  if (typeof obj.category === 'string') out.category = obj.category;
  if (typeof obj.rationale === 'string') out.rationale = obj.rationale;
  return out;
}
