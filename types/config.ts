/**
 * Configuration types for extension settings.
 * Persisted in chrome.storage.local
 */

/** Provider preset identifiers */
export type ProviderPreset =
  | 'openai'
  | 'deepseek'
  | 'groq'
  | 'ollama'
  | 'lmstudio'
  | 'together'
  | 'mistral'
  | 'openrouter'
  | 'custom';

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
  },
  sourceLanguage: 'auto',
  targetLanguage: 'vi',
  displayMode: 'bilingual-below',
  maxBatchChars: 2000,
  cacheTTLDays: 30,
  maxCacheSizeMB: 100,
  theme: 'dividing-line',
  translationPosition: 'below',
  darkMode: 'auto',
  siteRules: [],
  glossary: [],
  subtitleSettings: { ...DEFAULT_SUBTITLE_SETTINGS },
  customSystemPrompt: null,
  debugMode: false,
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
    preset: 'lmstudio',
    displayName: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: 'default',
    requiresApiKey: false,
  },
  {
    preset: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    requiresApiKey: true,
    placeholder: 'sk-...',
  },
  {
    preset: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    requiresApiKey: true,
  },
  {
    preset: 'groq',
    displayName: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    requiresApiKey: true,
    placeholder: 'gsk_...',
  },
  {
    preset: 'together',
    displayName: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    requiresApiKey: true,
  },
  {
    preset: 'mistral',
    displayName: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    requiresApiKey: true,
  },
  {
    preset: 'openrouter',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct',
    requiresApiKey: true,
    placeholder: 'sk-or-...',
  },
  {
    preset: 'custom',
    displayName: 'Custom',
    baseUrl: '',
    defaultModel: '',
    requiresApiKey: false,
  },
];
