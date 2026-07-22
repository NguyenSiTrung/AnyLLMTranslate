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
  /** 1000ms is more forgiving than 500ms for deliberate Space×3 taps */
  timeWindowMs: 1000,
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
