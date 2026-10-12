/**
 * Runtime config for the inline translate content module: the stored
 * InlineTranslateSettings after per-site overrides, plus the conversation
 * selectors resolved for the current hostname.
 */

import {
  DEFAULT_INLINE_TRANSLATE_SETTINGS,
  type InlineTranslateSettings,
} from '@/types/config';

export interface InlineTranslateRuntimeConfig extends Omit<InlineTranslateSettings, 'triggerKey'> {
  /** Settings constrain this to InlineTriggerKey; the runtime accepts any key. */
  triggerKey: string;
  /** Auto target language selectors for this hostname (site seeds / rules). */
  autoLanguageSelectors: string[];
}

export const DEFAULT_RUNTIME_CONFIG: InlineTranslateRuntimeConfig = {
  ...DEFAULT_INLINE_TRANSLATE_SETTINGS,
  blocklistPatterns: [],
  autoLanguageSelectors: [],
};
