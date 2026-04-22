/**
 * Configuration types for extension settings.
 * Persisted in chrome.storage.local
 */

/** Provider preset identifiers */
export type ProviderPreset = 'ollama' | 'custom';

/** Provider configuration for OpenAI-compatible APIs */
export interface ProviderConfig {
  preset: ProviderPreset;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  /** Display name for UI */
  displayName: string;
  /** Whether this provider requires an API key */
  requiresApiKey: boolean;
  /** Request timeout in milliseconds (default: 60000) */
  requestTimeoutMs?: number;
}

/** Translation display mode */
export type DisplayMode = 'bilingual-below' | 'translation-only';

/** All available visual theme identifiers */
export type ThemeName =
  | 'dividing-line'
  | 'blockquote'
  | 'paper'
  | 'underline'
  | 'dashed-underline'
  | 'highlight'
  | 'wavy-underline'
  | 'bubble'
  | 'side-by-side'
  | 'mask'
  | 'fade-in'
  | 'italic'
  | 'dotted-border'
  | 'shadow-card'
  | 'minimal'
  | 'gradient-accent';

/** Translation position relative to original text */
export type TranslationPosition = 'below' | 'above' | 'side';

/** Dark mode preference */
export type DarkMode = 'auto' | 'light' | 'dark';

/** Per-site translation rule */
export interface SiteRule {
  /** Unique rule identifier */
  id: string;
  /** Hostname pattern (supports wildcards, e.g. '*.example.com') */
  hostname: string;
  /** CSS selectors to include for translation */
  includeSelectors: string[];
  /** CSS selectors to exclude from translation */
  excludeSelectors: string[];
  /** Whether to always translate this site */
  alwaysTranslate: boolean;
  /** Whether to never translate this site */
  neverTranslate: boolean;
  /** Whether this is a built-in (read-only) rule */
  builtIn: boolean;
}

/** Glossary entry for term-protected translation */
export interface GlossaryEntry {
  /** Unique entry identifier */
  id: string;
  /** Source term in original language */
  source: string;
  /** Target translation */
  target: string;
}

/** Subtitle font family options */
export type SubtitleFontFamily = 'system' | 'serif' | 'monospace';

/** Subtitle overlay display mode (independent of page displayMode) */
export type SubtitleDisplayMode = 'bilingual' | 'translation-only';

/** Subtitle display settings */
export interface SubtitleSettings {
  /** Subtitle position on video */
  position: 'bottom' | 'top';
  /** Font size in pixels */
  fontSize: number;
  /** Background opacity (0–1) */
  backgroundOpacity: number;
  /** Whether subtitles are enabled */
  enabled: boolean;
  /** Font family for subtitle overlay */
  fontFamily: SubtitleFontFamily;
  /** Overlay display mode: show original + translated, or translated only */
  displayMode: SubtitleDisplayMode;
  /** Translation timeout in seconds (10–120) */
  translationTimeout: number;
  /** Preferred subtitle source language (ISO code, e.g. 'en') — auto-selects when tracks are discovered */
  preferredSubtitleLanguage: string;
  /** Auto-activate subtitles when preferred language is available */
  autoActivateSubtitles: boolean;
}

/** Inline translate settings for key-gesture translation */
export interface InlineTranslateSettings {
  /** Whether inline translate is enabled */
  enabled: boolean;
  /** Trigger key for the gesture (default: Space) */
  triggerKey: string;
  /** Number of consecutive key presses required (2–5, default: 3) */
  tapCount: number;
  /** Time window in ms for consecutive presses (200–1000, default: 500) */
  timeWindowMs: number;
  /** Target language for inline translation (ISO 639-1 code) */
  targetLanguage: string;
}

/** Extension settings stored in chrome.storage.local */
export interface ExtensionSettings {
  /** Active provider configuration */
  provider: ProviderConfig;
  /** Source language (ISO 639-1 code, or 'auto' for auto-detect) */
  sourceLanguage: string;
  /** Target language (ISO 639-1 code) */
  targetLanguage: string;
  /** Display mode for translations */
  displayMode: DisplayMode;
  /** Maximum characters per translation batch */
  maxBatchChars: number;
  /** Cache TTL in days */
  cacheTTLDays: number;
  /** Maximum cache size in MB */
  maxCacheSizeMB: number;
  /** Active visual theme */
  theme: ThemeName;
  /** Translation position relative to original */
  translationPosition: TranslationPosition;
  /** Dark mode preference */
  darkMode: DarkMode;
  /** Custom site translation rules */
  siteRules: SiteRule[];
  /** Custom glossary/dictionary entries */
  glossary: GlossaryEntry[];
  /** Subtitle display settings */
  subtitleSettings: SubtitleSettings;
  /** Custom system prompt template (null = use default) */
  customSystemPrompt: string | null;
  /** Debug mode toggle */
  debugMode: boolean;
  /** Text selection translate enabled */
  textSelectionEnabled: boolean;
  /** Mouse hover translate enabled */
  hoverTranslateEnabled: boolean;
  /** Hover translate delay in ms (200-500, default 300) */
  hoverDelay: number;
  /** Inline translate settings (key-gesture) */
  inlineTranslate: InlineTranslateSettings;
}

/** Provider preset definitions */
export interface ProviderPresetDefinition {
  preset: ProviderPreset;
  displayName: string;
  baseUrl: string;
  defaultModel: string;
  requiresApiKey: boolean;
  placeholder?: string;
}

/** Default subtitle settings */
export const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
  position: 'bottom',
  fontSize: 16,
  backgroundOpacity: 0.7,
  enabled: true,
  fontFamily: 'system',
  displayMode: 'bilingual',
  translationTimeout: 30,
  preferredSubtitleLanguage: 'en',
  autoActivateSubtitles: false,
};

/** Default inline translate settings */
export const DEFAULT_INLINE_TRANSLATE_SETTINGS: InlineTranslateSettings = {
  enabled: true,
  triggerKey: ' ',
  tapCount: 3,
  timeWindowMs: 500,
  targetLanguage: 'en',
};

/** Default settings */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  provider: {
    preset: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: '',
    model: 'gemma3:4b',
    temperature: 0.3,
    maxTokens: 4096,
    displayName: 'Ollama',
    requiresApiKey: false,
    requestTimeoutMs: 60000,
  },
  sourceLanguage: 'auto',
  targetLanguage: 'vi',
  displayMode: 'bilingual-below',
  maxBatchChars: 2000,
  cacheTTLDays: 30,
  maxCacheSizeMB: 100,
  theme: 'blockquote',
  translationPosition: 'below',
  darkMode: 'auto',
  siteRules: [],
  glossary: [],
  subtitleSettings: { ...DEFAULT_SUBTITLE_SETTINGS },
  customSystemPrompt: null,
  debugMode: false,
  textSelectionEnabled: true,
  hoverTranslateEnabled: false,
  hoverDelay: 300,
  inlineTranslate: { ...DEFAULT_INLINE_TRANSLATE_SETTINGS },
};

/** All available provider presets */
export const PROVIDER_PRESETS: ProviderPresetDefinition[] = [
  {
    preset: 'ollama',
    displayName: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'gemma3:4b',
    requiresApiKey: false,
  },
  {
    preset: 'custom',
    displayName: 'Custom',
    baseUrl: '',
    defaultModel: '',
    requiresApiKey: false,
  },
];
