/**
 * Sanitize LLM / heuristic site-rule drafts before applying to form state.
 */

import type { SuggestSiteRuleDraft, SiteRuleSuggestSource } from './types';

const MAX_SELECTOR_LEN = 200;
const DEFAULT_MAX_SELECTORS = 20;

const HOSTNAME_RE = /^(\*\.)?([a-z0-9-]+\.)*[a-z0-9-]+$/;
const SELECTOR_SAFE_RE = /^[\w\s\-.#:[\]()="'*>+~,|]+$/;
const SELECTOR_BAD_RE = /script|javascript:|expression\(|@import/i;

export function sanitizeSelector(sel: string): string | null {
  const trimmed = sel.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_SELECTOR_LEN) return null;
  if (SELECTOR_BAD_RE.test(trimmed)) return null;
  if (!SELECTOR_SAFE_RE.test(trimmed)) return null;

  // Rough balance check for brackets
  const pairs: Array<[string, string]> = [
    ['(', ')'],
    ['[', ']'],
  ];
  for (const [open, close] of pairs) {
    let depth = 0;
    for (const ch of trimmed) {
      if (ch === open) depth += 1;
      if (ch === close) depth -= 1;
      if (depth < 0) return null;
    }
    if (depth !== 0) return null;
  }

  return trimmed;
}

export function sanitizeSelectorList(
  list: unknown,
  max: number = DEFAULT_MAX_SELECTORS,
): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const s = sanitizeSelector(item);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function sanitizeHostname(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  let h = raw.trim().toLowerCase().replace(/\.$/, '');
  if (!h) return fallback;
  if (!HOSTNAME_RE.test(h)) return fallback;
  // Reject bare "*"
  if (h === '*' || h === '*.') return fallback;
  return h;
}

function asSource(raw: unknown, fallback: SiteRuleSuggestSource): SiteRuleSuggestSource {
  return raw === 'tab' || raw === 'fetch' ? raw : fallback;
}

/**
 * Merge a partial (LLM) draft onto a trusted fallback (usually heuristic).
 * Invalid fields fall back; warnings are unioned.
 */
export function sanitizeDraft(
  raw: Partial<SuggestSiteRuleDraft> & Record<string, unknown>,
  fallback: SuggestSiteRuleDraft,
): SuggestSiteRuleDraft {
  const includeSelectors = sanitizeSelectorList(raw.includeSelectors);
  const excludeSelectors = sanitizeSelectorList(raw.excludeSelectors);

  const hostname = sanitizeHostname(raw.hostname, fallback.hostname);
  const source = asSource(raw.source, fallback.source);

  let alwaysTranslate =
    typeof raw.alwaysTranslate === 'boolean'
      ? raw.alwaysTranslate
      : fallback.alwaysTranslate;
  let neverTranslate =
    typeof raw.neverTranslate === 'boolean'
      ? raw.neverTranslate
      : fallback.neverTranslate;

  // Invalid combo → default mode
  if (alwaysTranslate && neverTranslate) {
    alwaysTranslate = false;
    neverTranslate = false;
  }

  const category =
    typeof raw.category === 'string' && raw.category.trim()
      ? raw.category.trim().slice(0, 50)
      : fallback.category;

  const rationale =
    typeof raw.rationale === 'string' && raw.rationale.trim()
      ? raw.rationale.trim().slice(0, 300)
      : fallback.rationale;

  const warningSet = new Set<string>();
  for (const w of fallback.warnings ?? []) {
    if (w) warningSet.add(w);
  }
  if (Array.isArray(raw.warnings)) {
    for (const w of raw.warnings) {
      if (typeof w === 'string' && w) warningSet.add(w);
    }
  }

  const draft: SuggestSiteRuleDraft = {
    hostname,
    includeSelectors:
      includeSelectors.length > 0 ? includeSelectors : fallback.includeSelectors,
    excludeSelectors:
      excludeSelectors.length > 0 ? excludeSelectors : [...fallback.excludeSelectors],
    source,
    warnings: warningSet.size > 0 ? Array.from(warningSet) : undefined,
  };

  if (alwaysTranslate) draft.alwaysTranslate = true;
  if (neverTranslate) draft.neverTranslate = true;
  if (category) draft.category = category;
  if (rationale) draft.rationale = rationale;

  return draft;
}
