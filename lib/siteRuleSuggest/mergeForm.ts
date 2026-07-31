/**
 * Merge an AI-suggested draft into the Site Rules edit form state.
 */

import type { SuggestSiteRuleDraft } from './types';

export interface RuleFormSuggestSlice {
  hostname: string;
  includeSelectors: string[];
  excludeSelectors: string[];
  alwaysTranslate: boolean;
  neverTranslate: boolean;
  categoryValue: string;
}

function getMode(
  form: Pick<RuleFormSuggestSlice, 'alwaysTranslate' | 'neverTranslate'>,
): 'default' | 'always' | 'never' {
  if (form.alwaysTranslate) return 'always';
  if (form.neverTranslate) return 'never';
  return 'default';
}

/**
 * Apply draft into form fields per spec merge rules.
 * Does not persist — caller still requires explicit Save.
 */
export function mergeSuggestDraftIntoRuleForm(
  form: RuleFormSuggestSlice,
  draft: SuggestSiteRuleDraft,
  isNew: boolean,
): RuleFormSuggestSlice {
  const mode = getMode(form);
  let alwaysTranslate = form.alwaysTranslate;
  let neverTranslate = form.neverTranslate;

  if (mode === 'default') {
    if (draft.alwaysTranslate) {
      alwaysTranslate = true;
      neverTranslate = false;
    } else if (draft.neverTranslate) {
      alwaysTranslate = false;
      neverTranslate = true;
    }
  }

  return {
    hostname: isNew || !form.hostname.trim() ? draft.hostname : form.hostname,
    includeSelectors: [...draft.includeSelectors],
    excludeSelectors: [...draft.excludeSelectors],
    alwaysTranslate,
    neverTranslate,
    categoryValue:
      form.categoryValue === '__none__' && draft.category
        ? draft.category
        : form.categoryValue,
  };
}
