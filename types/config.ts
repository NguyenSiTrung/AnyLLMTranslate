/**
 * Configuration types for extension settings.
 * Persisted in chrome.storage.local
 */

import type { ProfileKnobs } from '@/lib/subtitleProfiles';

/** Provider preset identifiers */
export type ProviderPreset = 'custom';

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
  /** Max requests per minute (0 = unlimited). Threaded into the service for RPM limiting. */
  maxRpm?: number;
  /** Connection test result status */
  connectionStatus?: 'unknown' | 'success' | 'error';
}

/**
 * A single API key within a pool provider. Each key is an independent rotation
 * slot: it has its own rate limiter (maxRpm), circuit-breaker state, and
 * enable flag. The apiKey is AES-GCM encrypted at rest.
 */
export interface PoolKey {
  /** Stable, unique key identifier (used as the circuit-breaker identity). */
  id: string;
  /** The API key (encrypted at rest via lib/crypto.ts). */
  apiKey: string;
  /** Optional human-readable label shown in the UI. */
  label?: string;
  /** Max requests per minute for this key (0 = unlimited). */
  maxRpm: number;
  /** Whether this key participates in the rotation pool. */
  enabled: boolean;
}

/**
 * A provider entry in the multi-provider pool. Holds the shared endpoint
 * config plus an array of {@link PoolKey}s. Each (provider, key) pair is a
 * rotation slot when both `enabled` flags are true.
 */
export interface PoolProvider {
  /** Stable, unique provider identifier. */
  id: string;
  /** Human-readable name shown in the UI. */
  displayName: string;
  /** OpenAI-compatible base URL (e.g. https://api.openai.com/v1). */
  baseUrl: string;
  /** Model identifier (e.g. gpt-4o-mini). */
  model: string;
  /** Whether this provider requires an API key per request. */
  requiresApiKey: boolean;
  /** Catalog entry id from OPENAI_COMPATIBLE_CATALOG (for re-selecting the entry). */
  catalogId?: string;
  /** Sampling temperature. */
  temperature: number;
  /** Max tokens per completion. */
  maxTokens: number;
  /** Request timeout in milliseconds (default: 60000). */
  requestTimeoutMs?: number;
  /** Whether this provider participates in the rotation pool. */
  enabled: boolean;
  /** The pool of API keys for this provider. */
  keys: PoolKey[];
}

/** Onboarding flow state for first-run setup */
export interface OnboardingState {
  /** Setup wizard completed successfully */
  completed: boolean;
  /** User skipped the automatic first-run wizard */
  skipped: boolean;
  /** Last wizard step visited, used to resume setup */
  lastStep?: 'welcome' | 'provider' | 'test' | 'language' | 'done';
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
  | 'gradient-accent'
  | 'custom';

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
  /** Optional page category override for this hostname (used in context-aware translation) */
  category?: string;
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

/** Subtitle font size mode: fixed pixel value or auto-scaled to video size */
export type SubtitleFontSizeMode = 'fixed' | 'auto';

/** Subtitle display settings */
export interface SubtitleSettings {
  /** Subtitle position on video */
  position: 'bottom' | 'top';
  /** Font size in pixels (used when fontSizeMode is 'fixed') */
  fontSize: number;
  /** Font size mode: 'fixed' uses the fontSize value directly, 'auto' scales based on video size */
  fontSizeMode: SubtitleFontSizeMode;
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
  /** Platform identifiers disabled by the user (opt-out model; empty = all enabled) */
  disabledSubtitleSites: string[];
  /**
   * Per-knob global translation-style overrides. Only set knobs override the
   * resolved profile preset; absent knobs inherit. Undefined/empty == no
   * override == today's behavior. Consumed in services/background.ts via
   * resolveEffectiveKnobs().
   */
  knobOverrides?: Partial<ProfileKnobs>;
}

/** Custom theme user-defined configuration */
export interface CustomThemeConfig {
  textColor: string;
  backgroundColor: string;
  borderStyle: 'none' | 'solid' | 'dashed' | 'dotted';
  borderColor: string;
  fontStyle: 'normal' | 'italic';
  fontSize: 'smaller' | 'same' | 'larger';
}

/** PDF auto-open trigger modes */
export type PdfAutoOpenMode = 'off' | 'prompt' | 'auto';

/** How the PDF viewer opens relative to the source tab */
export type PdfOpenMode = 'new-tab' | 'same-tab';

/** PDF translator settings */
export interface PdfSettings {
  /** When to auto-open the bundled viewer after detecting a PDF tab.
   *  - 'off':    never auto-open (default; user must click popup/context menu)
   *  - 'prompt': show an in-page banner button; one click opens the viewer
   *  - 'auto':   open the viewer automatically
   */
  autoOpen: PdfAutoOpenMode;
  /** Whether to open in a new tab (keeps the native viewer) or replace the
   *  current tab (cleaner, but loses the native-viewer tab). */
  openMode: PdfOpenMode;
  /** Hostnames for which auto-open is suppressed even when autoOpen !== 'off'. */
  neverAutoOpenSites: string[];
}

/** Page context extracted for context-aware translation */
export interface PageContext {
  title: string;
  description: string;
  domain: string;
  category?: string;
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
  /** First-run setup wizard state */
  onboarding: OnboardingState;
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
  /** CSS selectors excluded from translation globally (merged with per-site excludes) */
  globalExcludeSelectors: string[];
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
  /** User-defined custom theme configuration */
  customTheme?: CustomThemeConfig;
  /** Enable context-aware translation (injects page title/description/domain into prompts) */
  enableContextAwareTranslation: boolean;
  /** Enable automatic LLM-based page category detection (requires context-aware translation) */
  enableLLMPageCategoryDetection: boolean;
  /** Mode for LLM category detection */
  llmCategoryDetectionMode: 'async' | 'blocking';
  /** Enable smart excludes — automatically skip structural/navigation elements from translation */
  enableSmartExcludes: boolean;
  /** PDF translator auto-open behavior */
  pdfSettings: PdfSettings;
  /** Max requests per minute to the provider (0 = unlimited, prevents hitting provider rate limits) */
  maxRpm: number;
  /**
   * Multi-provider pool: multiple active providers, each with one or more API
   * keys, rotated round-robin with circuit-breaker failover. Empty for legacy
   * users until migrated by loadSettings() (see FR-1 migration rule).
   */
  providers: PoolProvider[];
}

/** Provider preset definitions */
export interface ProviderPresetDefinition {
  preset: ProviderPreset;
  displayName: string;
  description?: string;
  baseUrl?: string;
  defaultModel?: string;
  requiresApiKey: boolean;
  placeholder?: string;
}

/** Default subtitle settings */
export const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
  position: 'bottom',
  fontSize: 16,
  fontSizeMode: 'fixed',
  backgroundOpacity: 0.7,
  enabled: true,
  fontFamily: 'system',
  displayMode: 'bilingual',
  translationTimeout: 30,
  preferredSubtitleLanguage: 'en',
  autoActivateSubtitles: false,
  disabledSubtitleSites: [],
  knobOverrides: {},
};

/** Default inline translate settings */
export const DEFAULT_INLINE_TRANSLATE_SETTINGS: InlineTranslateSettings = {
  enabled: true,
  triggerKey: ' ',
  tapCount: 3,
  timeWindowMs: 500,
  targetLanguage: 'en',
};

/** Default PDF translator settings — auto-open is OFF by default. */
export const DEFAULT_PDF_SETTINGS: PdfSettings = {
  autoOpen: 'off',
  openMode: 'new-tab',
  neverAutoOpenSites: [],
};

/** Default custom theme configuration */
export const DEFAULT_CUSTOM_THEME: CustomThemeConfig = {
  textColor: '#555555',
  backgroundColor: 'transparent',
  borderStyle: 'solid',
  borderColor: '#3b82f6',
  fontStyle: 'normal',
  fontSize: 'same',
};

/** Default onboarding state */
export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  completed: false,
  skipped: false,
  lastStep: 'welcome',
};

export const CRITICAL_GLOBAL_EXCLUDES = [
  'pre',
  '.code-block',
  '[contenteditable="true"]',
  'textarea',
  'input',
  '[translate="no"]',
  '.notranslate',
  'script',
  'style'
];

/** Smart exclude selectors — structural/navigation elements excluded when enableSmartExcludes is on.
 *  These prevent translating non-content chrome (navbars, TOC, footers, breadcrumbs, sidebars). */
export const SMART_EXCLUDE_SELECTORS = [
  // Navigation chrome
  'nav', '[role="navigation"]',
  // Table of contents
  '.toc', '#toc', '[role="directory"]',
  // Footers / metadata / references
  '.navbox', '.catlinks', '.reflist',
  '.breadcrumb', '.breadcrumbs',
  // Sidebars
  '.sidebar', '[role="complementary"]',
  // Pagination
  '.pagination',
  // Infoboxes (data tables, not prose)
  '.infobox', '.infobox_v2',
  // Common UI patterns
  '[aria-label="breadcrumb"]',
  '.table-of-contents',
];

/** Default settings */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  provider: {
    preset: 'custom',
    baseUrl: '',
    apiKey: '',
    model: '',
    temperature: 0.3,
    maxTokens: 4096,
    displayName: 'Custom',
    connectionStatus: 'unknown',
    requiresApiKey: false,
    requestTimeoutMs: 60000,
    maxRpm: 0,
  },
  onboarding: { ...DEFAULT_ONBOARDING_STATE },
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
  globalExcludeSelectors: [...CRITICAL_GLOBAL_EXCLUDES],
  glossary: [],
  subtitleSettings: { ...DEFAULT_SUBTITLE_SETTINGS },
  customSystemPrompt: null,
  debugMode: false,
  textSelectionEnabled: true,
  hoverTranslateEnabled: false,
  hoverDelay: 300,
  inlineTranslate: { ...DEFAULT_INLINE_TRANSLATE_SETTINGS },
  customTheme: { ...DEFAULT_CUSTOM_THEME },
  enableContextAwareTranslation: true,
  enableLLMPageCategoryDetection: false,
  llmCategoryDetectionMode: 'async',
  enableSmartExcludes: true,
  pdfSettings: { ...DEFAULT_PDF_SETTINGS },
  maxRpm: 0,
  providers: [],
};

/** All available provider presets */
export const PROVIDER_PRESETS: ProviderPresetDefinition[] = [
  {
    preset: 'custom',
    displayName: 'Custom (OpenAI Compatible)',
    description: 'Any OpenAI-compatible API endpoint (Ollama, vLLM, LiteLLM, etc.)',
    baseUrl: '',
    defaultModel: '',
    requiresApiKey: false,
  },
];
