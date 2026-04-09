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
