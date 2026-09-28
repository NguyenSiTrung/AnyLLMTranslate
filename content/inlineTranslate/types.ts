/**
 * Runtime config for the inline translate content module.
 * Mirrors InlineTranslateSettings + fields needed at gesture time.
 */

export interface InlineTranslateRuntimeConfig {
  enabled: boolean;
  triggerKey: string;
  tapCount: number;
  timeWindowMs: number;
  targetLanguage: string;
  idleMs: number;
  triggerGapMs: number;
  triggerToleranceCount: number;
  enableLanguagePrefix: boolean;
  languagePrefix: string;
  dualMode: boolean;
  blocklistPatterns: string[];
  enableFallbackUndo: boolean;
}

export const DEFAULT_RUNTIME_CONFIG: InlineTranslateRuntimeConfig = {
  enabled: true,
  triggerKey: ' ',
  tapCount: 3,
  /** Keep in sync with DEFAULT_INLINE_TRANSLATE_SETTINGS.timeWindowMs (1500ms) */
  timeWindowMs: 1500,
  targetLanguage: 'en',
  idleMs: 0,
  triggerGapMs: 0,
  triggerToleranceCount: 0,
  enableLanguagePrefix: true,
  languagePrefix: '/',
  dualMode: false,
  blocklistPatterns: [],
  enableFallbackUndo: true,
};
