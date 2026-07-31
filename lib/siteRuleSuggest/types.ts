/** Shared types for LLM-assisted site rule suggestions. */

export interface DomOutlineNode {
  tag: string;
  id?: string;
  classes?: string[];
  role?: string;
  textSample?: string;
  textLength: number;
  depth: number;
}

export interface DomOutline {
  url: string;
  hostname: string;
  title: string;
  nodes: DomOutlineNode[];
}

/** How page structure was captured (not whether LLM ran). */
export type SiteRuleSuggestSource = 'tab' | 'fetch';

export interface SuggestSiteRuleDraft {
  hostname: string;
  includeSelectors: string[];
  excludeSelectors: string[];
  alwaysTranslate?: boolean;
  neverTranslate?: boolean;
  category?: string;
  source: SiteRuleSuggestSource;
  warnings?: string[];
  rationale?: string;
}
