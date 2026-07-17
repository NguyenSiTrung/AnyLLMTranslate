/**
 * Configuration types for extension settings.
 * Persisted in chrome.storage.local
 */

import type { ProfileKnobs } from '@/lib/subtitleProfiles';

/** Provider preset identifiers */
export type ProviderPreset = 'custom';

/**
 * Persisted connection-test outcome for a pool key or provider. Stored in
 * plaintext (carries no secret) so it survives card collapse, tab navigation,
 * and extension reload. Invalidation: editing baseUrl/model/apiKey clears it.
 */
export interface KeyTestResult {
  success: boolean;
  /** Epoch ms when the test was run. */
  at: number;
  /** Round-trip latency in milliseconds (when available). */
  latencyMs?: number;
  /** Error message from a failed test (undefined on success). */
  error?: string;
}

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
  /** Per-provider max batch size in characters. Overrides the global
   *  maxBatchChars when set (> 0). 0 = use global default. */
  maxBatchChars?: number;
  /** Per-provider max number of text pieces per request. 0 = unlimited. */
  maxTextGroupCount?: number;
  /** Connection test result status */
  connectionStatus?: 'unknown' | 'success' | 'error';
}

/**
 * Safe defaults for new pool keys / fresh installs.
 *
 * Previous unlimited defaults (all 0) let PDF and page translate fire multiple
 * requests back-to-back on one key, which often trips provider 429s and the
 * pool "cooling" UI. Users can still set any field to 0 for unlimited / off.
 */
export const DEFAULT_KEY_MAX_RPM = 20;
/** One in-flight request per key (0 = use only the global semaphore cap). */
export const DEFAULT_KEY_CONCURRENCY_LIMIT = 1;
/** Minimum gap between dispatches on one key in ms (0 = off). */
export const DEFAULT_KEY_INTERVAL_MS = 500;

/** Throttle fields applied when creating a new pool key. */
export function defaultPoolKeyThrottle(): Pick<
  PoolKey,
  'maxRpm' | 'concurrencyLimit' | 'interval'
> {
  return {
    maxRpm: DEFAULT_KEY_MAX_RPM,
    concurrencyLimit: DEFAULT_KEY_CONCURRENCY_LIMIT,
    interval: DEFAULT_KEY_INTERVAL_MS,
  };
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
  /** Max requests per minute for this key (0 = unlimited). Default: {@link DEFAULT_KEY_MAX_RPM}. */
  maxRpm: number;
  /**
   * Per-key concurrency limit (0 = use the global semaphore cap only). Caps how
   * many in-flight requests this single key may hold at once (FR-5).
   * Default: {@link DEFAULT_KEY_CONCURRENCY_LIMIT}.
   */
  concurrencyLimit: number;
  /**
   * Minimum gap in ms between successive requests on this key (0 = off, FR-5 throttle).
   * Default: {@link DEFAULT_KEY_INTERVAL_MS}.
   */
  interval: number;
  /** Whether this key participates in the rotation pool. */
  enabled: boolean;
  /** Persisted last connection-test result (survives collapse/reload). */
  lastTestResult?: KeyTestResult;
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
  /** Per-provider max batch size in characters. Overrides the global
   *  maxBatchChars when set (> 0). 0 = use global default. */
  maxBatchChars?: number;
  /** Per-provider max number of text pieces per request. 0 = unlimited. */
  maxTextGroupCount?: number;
  /** Whether this provider participates in the rotation pool. */
  enabled: boolean;
  /** The pool of API keys for this provider. */
  keys: PoolKey[];
  /** Persisted last provider-level connection-test result. */
  lastTestResult?: KeyTestResult;
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

/**
 * YouTube ASR (auto-generated caption) pre-translate re-alignment settings.
 * Local rule engine re-chunks fragmented ASR cues into sentence-like units
 * before translation. See `lib/youtubeAsrResegment.ts`.
 */
export interface YoutubeAsrResegmentSettings {
  /**
   * When true, re-align YouTube auto-generated captions before translate.
   * Default true. Only applies to ASR tracks (`kind=asr` / isAutoGenerated).
   */
  enable: boolean;
  /**
   * When true (and `enable` is true), prefer AI/BYOK resegment via the user's
   * provider pool before local rules. Fail-open to local rules on AI failure.
   * Default false (opt-in; costs LLM tokens).
   * @see services resegmentYoutubeAsr / RESEGMENT_YOUTUBE_ASR
   */
  aiEnable: boolean;
}

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
   * Whether the generic subtitle handler (last-resort fallback that intercepts
   * subtitles on any site with a `<video>` element) is registered. Default on.
   * Independent from `disabledSubtitleSites` (which targets specific platforms).
   */
  enableGenericSubtitleHandler: boolean;
  /**
   * Per-knob global translation-style overrides. Only set knobs override the
   * resolved profile preset; absent knobs inherit. Undefined/empty == no
   * override == today's behavior. Consumed in services/background.ts via
   * resolveEffectiveKnobs().
   */
  knobOverrides?: Partial<ProfileKnobs>;
  /**
   * YouTube ASR sentence re-alignment before translation.
   * Default: `{ enable: true, aiEnable: false }`. Deep-merged on load.
   */
  youtubeAsrResegment?: YoutubeAsrResegmentSettings;
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
  /**
   * When true, non-numeric text inside detected table regions may be
   * translated. Default false: entire table region is protected (figure).
   * Numeric/currency cells always stay verbatim.
   */
  translateTableText: boolean;
  /**
   * When true, use stricter formula classification thresholds (more aggressive
   * math skip). Default false.
   */
  strictMathSkip: boolean;
  /**
   * When true, run an LLM term-extraction pre-pass over sampled prose before
   * multi-page translation and inject consistent technical terms into context.
   * Default true. Fail-open: extraction failure never blocks translation.
   */
  autoExtractTerms: boolean;
  /**
   * When true, score pages for little/no extractable text vs page area to
   * detect heavily scanned PDFs. Default true.
   */
  detectScanned: boolean;
  /**
   * When true, automatically enable the OCR workaround path (white underlay +
   * forced text overlay assumptions) for pages/docs flagged as heavily scanned.
   * Default true. Only applies when detectScanned finds a heavy scan.
   */
  autoOcrWorkaround: boolean;
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
  /**
   * Idle debounce after the last trigger tap before fire (ms).
   * 0 = fire immediately once tapCount is reached (subject to microtask).
   * Immersive-style: wait briefly after the space burst settles.
   */
  idleMs: number;
  /**
   * Minimum gap between consecutive trigger taps (ms). Taps closer than this
   * still count but gap tolerance can be applied via triggerToleranceCount.
   */
  triggerGapMs: number;
  /**
   * How many out-of-window / noisy taps may be tolerated before resetting the
   * gesture counter (0 = strict window filtering only).
   */
  triggerToleranceCount: number;
  /** When true, leading `/en`-style prefixes override target language for one request */
  enableLanguagePrefix: boolean;
  /** Prefix character for language override (default `/`) */
  languagePrefix: string;
  /**
   * When true, write original + translation joined; when false (default),
   * replace field with translation only.
   */
  dualMode: boolean;
  /**
   * URL/hostname patterns that disable inline translate (wildcards supported).
   * Merged with built-in seed defaults at runtime when empty at load.
   */
  blocklistPatterns: string[];
  /**
   * When true, re-trigger gesture/shortcut restores pre-translate text via
   * undoMap if native Ctrl+Z is unavailable after write-back.
   */
  enableFallbackUndo: boolean;
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
  /**
   * When true (default), short selections request Immersive-style dictionary
   * JSON (phonetic, POS, definitions). When false, selection always uses plain
   * translation. Opt-in per request via message.dictionaryMode — hover/inline
   * never use dictionary mode.
   */
  selectionDictionaryEnabled: boolean;
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
  /**
   * Global max RPM mirror (legacy / Advanced UI). Per-key {@link PoolKey.maxRpm}
   * is what the pool rate-limits on. 0 = unlimited. Default: {@link DEFAULT_KEY_MAX_RPM}.
   */
  maxRpm: number;
  /**
   * One-time migration flag: keys that still used the pre-safe unlimited
   * triple (maxRpm/concurrencyLimit/interval all 0) were upgraded to
   * {@link defaultPoolKeyThrottle}. Once true, loadSettings will not re-apply
   * that upgrade, so users may set 0 again for unlimited without being reset.
   * New installs start as true (defaults already safe).
   */
  safeKeyThrottleMigrated?: boolean;
  /**
   * Multi-provider pool: multiple active providers, each with one or more API
   * keys, rotated round-robin with circuit-breaker failover. Empty for legacy
   * users until migrated by loadSettings() (see FR-1 migration rule).
   */
  providers: PoolProvider[];
  /** Preserve inline markup (<b>, <a>, <code>, …) in translated paragraphs (FR-1 rich translate) */
  enableRichTranslate: boolean;
  /** Render short pieces (≤ SHORT_PIECE_THRESHOLD chars) inline as " (translation)" instead of a
   *  themed block. Off by default → all pieces use uniform block display that matches the active theme. */
  enableCompactInlineForShortText: boolean;
  /** Skip LLM calls when the detected source language already matches the target (FR-3 source-lang gate) */
  enableSourceLanguageDetection: boolean;
  /** Cache translation failures for a short TTL so flaky providers aren't retried every scroll-past (FR-4 negative cache) */
  enableFailureCache: boolean;
  /** Negative-cache entry TTL in minutes (FR-4, default 120) */
  failureCacheTtlMinutes: number;
  /** Stream web-page translations incrementally instead of waiting for the full batch (default ON; non-stream fallback on failure) */
  enableStreamingTranslation: boolean;
  /** Restore translated state on page reload if a snapshot + cache are still present (FR-7 web resume) */
  enableWebResume: boolean;
  /** Max number of text pieces grouped into a single LLM request (FR-2, default 4 — mirrors Immersive's LLM default) */
  maxTextGroupLengthPerRequest: number;
  /** Max total characters allowed in a single LLM request (FR-2, default 2000) */
  maxTextLengthPerRequest: number;
  /** FR-4: When ON, the walk under <body> only descends into direct children whose tag
   *  is in BODY_TRANSLATE_TAGS (MAIN, ARTICLE, SECTION, DIV); other top-level tags
   *  (NAV, ASIDE, HEADER, FOOTER, FORM, TABLE, …) are skipped entirely. Default off. */
  enableBodyTagWhitelist: boolean;
  /** FR-5: When ON, within aside regions (ASIDE, [role="complementary"], sidebar selectors),
   *  apply per-paragraph and per-region text caps to limit token waste + page clutter.
   *  Default ON (Balanced). Classic preset turns off. Cap values are constants
   *  (ASIDE_MAX_TEXT_PER_PARAGRAPH/REGION). */
  enableAsideCaps: boolean;
  /**
   * When ON, adjust effective max pieces/chars per LLM request from rolling
   * batch latency (web-translate-v3 FR-9). Default off until calibrated.
   */
  enableAdaptiveBatching: boolean;
  /**
   * When ON, include active model id in the web translation cache key (FR-14).
   * Default off — changing models can reuse cache; turn on for strict isolation.
   */
  cacheKeyIncludesModel: boolean;
  /**
   * When ON, detect source-echo / dropped &lt;z&gt; tags after a batch and issue
   * one automatic re-prompt (FR-16). Default off.
   */
  enableTranslationQualityCheck: boolean;
  /**
   * When ON, apply safer flex/grid/card insertion heuristics for translations (FR-18).
   * Default off — can alter host layout.
   */
  enableLayoutContainment: boolean;
  /**
   * When ON, walk open shadow roots during DOM extraction (FR-23). Default off.
   */
  enableShadowDomWalk: boolean;
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

/** Default YouTube ASR resegment settings (local rules on; AI off). */
export const DEFAULT_YOUTUBE_ASR_RESEGMENT_SETTINGS: YoutubeAsrResegmentSettings = {
  enable: true,
  aiEnable: false,
};

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
  enableGenericSubtitleHandler: true,
  knobOverrides: {},
  youtubeAsrResegment: { ...DEFAULT_YOUTUBE_ASR_RESEGMENT_SETTINGS },
};

/**
 * Default site blocklist for hosts where programmatic input write-back is
 * unreliable (seeded from Immersive Translate input-translate excludes).
 */
export const DEFAULT_INLINE_TRANSLATE_BLOCKLIST: string[] = [
  '*notion.so',
  '*notion.site',
  '*figma.com',
  '*larksuite.com',
  '*feishu.cn',
  '*feishu.net',
  '*docs.google.com',
  '*sheets.google.com',
];

/** Default inline translate settings */
export const DEFAULT_INLINE_TRANSLATE_SETTINGS: InlineTranslateSettings = {
  enabled: true,
  triggerKey: ' ',
  tapCount: 3,
  timeWindowMs: 500,
  targetLanguage: 'en',
  idleMs: 0,
  triggerGapMs: 0,
  triggerToleranceCount: 0,
  enableLanguagePrefix: true,
  languagePrefix: '/',
  dualMode: false,
  blocklistPatterns: [...DEFAULT_INLINE_TRANSLATE_BLOCKLIST],
  enableFallbackUndo: true,
};

/** Default PDF translator settings — auto-open is OFF by default. */
export const DEFAULT_PDF_SETTINGS: PdfSettings = {
  autoOpen: 'off',
  openMode: 'new-tab',
  neverAutoOpenSites: [],
  translateTableText: false,
  strictMathSkip: false,
  autoExtractTerms: true,
  detectScanned: true,
  autoOcrWorkaround: true,
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
    maxRpm: DEFAULT_KEY_MAX_RPM,
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
  selectionDictionaryEnabled: true,
  hoverTranslateEnabled: false,
  hoverDelay: 300,
  inlineTranslate: { ...DEFAULT_INLINE_TRANSLATE_SETTINGS },
  customTheme: { ...DEFAULT_CUSTOM_THEME },
  enableContextAwareTranslation: true,
  enableLLMPageCategoryDetection: false,
  llmCategoryDetectionMode: 'async',
  enableSmartExcludes: true,
  pdfSettings: { ...DEFAULT_PDF_SETTINGS },
  maxRpm: DEFAULT_KEY_MAX_RPM,
  /**
   * False so existing installs (merged from storage without this field) still
   * run the one-time 0/0/0 → safe throttle upgrade. Fresh installs set true in
   * loadSettings when no stored settings exist (defaults already safe).
   */
  safeKeyThrottleMigrated: false,
  /**
   * A brand-new install ships with exactly one default pool provider (mirroring
   * the legacy single-provider behavior) so the coordinator always has at least
   * one slot to dispatch to. Existing users get this via loadSettings migration.
   */
  providers: [
    {
      id: 'p_default',
      displayName: 'Custom',
      baseUrl: '',
      model: '',
      requiresApiKey: false,
      temperature: 0.3,
      maxTokens: 4096,
      requestTimeoutMs: 60000,
      enabled: true,
      keys: [
        {
          id: 'k_default',
          apiKey: '',
          ...defaultPoolKeyThrottle(),
          enabled: true,
        },
      ],
    },
  ],
  enableRichTranslate: true,
  enableCompactInlineForShortText: false,
  enableSourceLanguageDetection: true,
  enableFailureCache: true,
  failureCacheTtlMinutes: 120,
  enableStreamingTranslation: true,
  enableWebResume: true,
  maxTextGroupLengthPerRequest: 4,
  maxTextLengthPerRequest: 2000,
  enableBodyTagWhitelist: false,
  enableAsideCaps: true,
  enableAdaptiveBatching: false,
  cacheKeyIncludesModel: false,
  enableTranslationQualityCheck: false,
  enableLayoutContainment: false,
  enableShadowDomWalk: false,
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
