/**
 * Zustand settings store — reactive state management for extension settings.
 * Syncs with chrome.storage.local and listens for cross-context changes.
 * All persistence goes through lib/config.ts so API keys are encrypted at rest.
 */

import { create } from 'zustand';
import type { ExtensionSettings, ThemeName } from '@/types/config';
import { DEFAULT_SETTINGS } from '@/types/config';
import type { ProviderConfig } from '@/types/config';
import { loadSettings, saveSettings, updateSettings as updateSettingsInStorage } from '@/lib/config';
import { deepMerge } from '@/lib/utils';
import { BUILT_IN_RULES } from '@/lib/siteRules';

interface SettingsState extends ExtensionSettings {
  /** Whether the store has loaded from storage */
  isLoaded: boolean;
  /** Load settings from chrome.storage.local */
  loadFromStorage: () => Promise<void>;
  /** Update partial settings (merges and persists) */
  updateSettings: (partial: Partial<ExtensionSettings>) => Promise<void>;
  /** Convenience: update partial with nested merge (for sections) */
  updateSetting: (partial: Partial<ExtensionSettings>) => Promise<void>;
  /** Update provider config (merges and persists) */
  updateProvider: (partial: Partial<ProviderConfig>) => Promise<void>;
  /** Reset to default settings */
  resetToDefaults: () => Promise<void>;
}

/** Create the Zustand settings store */
export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  isLoaded: false,

  loadFromStorage: async () => {
    try {
      const loaded = await loadSettings();
      set({ ...loaded, isLoaded: true });
    } catch {
      set({ isLoaded: true });
    }
  },

  updateSettings: async (partial) => {
    await updateSettingsInStorage(partial);
    set((state) => deepMerge(state as unknown as Record<string, unknown>, partial as unknown as Record<string, unknown>) as unknown as SettingsState);
  },

  updateSetting: async (partial) => {
    await updateSettingsInStorage(partial);
    set((state) => deepMerge(state as unknown as Record<string, unknown>, partial as unknown as Record<string, unknown>) as unknown as SettingsState);
  },

  updateProvider: async (partial) => {
    const current = get();
    const provider = { ...current.provider, ...partial };
    await updateSettingsInStorage({ provider });
    set({ provider });
  },

  resetToDefaults: async () => {
    const defaults = {
      ...DEFAULT_SETTINGS,
      siteRules: BUILT_IN_RULES.map((r) => ({ ...r })),
    };
    await saveSettings(defaults);
    set({ ...defaults, isLoaded: true });
  },
}));

/**
 * Keep decrypted in-memory API keys across a storage-event merge.
 *
 * chrome.storage.onChanged delivers ciphertext (or would force a "***" mask).
 * Writing "***"/ciphertext into the store mid-edit resets controlled inputs and
 * useDeferredCommit drafts, so the field looks unfocused / refuses typing.
 * Prefer the previous plaintext until async loadFromStorage decrypts; brand-new
 * keys without a prior plaintext stay blank (never flash ciphertext).
 */
function preserveInMemoryApiKeys(
  prev: ExtensionSettings,
  next: ExtensionSettings,
): ExtensionSettings {
  const prevLegacy = prev.provider?.apiKey;
  const keepLegacy =
    typeof prevLegacy === 'string' && prevLegacy.length > 0 && prevLegacy !== '***'
      ? prevLegacy
      : '';

  let provider = next.provider;
  if (provider?.apiKey) {
    provider = { ...provider, apiKey: keepLegacy };
  }

  const prevKeyById = new Map<string, string>();
  for (const p of prev.providers ?? []) {
    for (const k of p.keys ?? []) {
      if (k.apiKey && k.apiKey !== '***') prevKeyById.set(k.id, k.apiKey);
    }
  }

  let providers = next.providers;
  if (providers && providers.length > 0) {
    providers = providers.map((p) => ({
      ...p,
      keys: (p.keys ?? []).map((key) => {
        if (!key.apiKey) return key;
        return { ...key, apiKey: prevKeyById.get(key.id) ?? '' };
      }),
    }));
  }

  return {
    ...next,
    ...(provider ? { provider } : {}),
    ...(providers ? { providers } : {}),
  };
}

/** Listen for storage changes from other contexts (popup, options, content) */
export function initStorageSync(): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local' || !changes['anyllm-translate-settings']) return;

    const newVal = changes['anyllm-translate-settings'].newValue as
      | Partial<ExtensionSettings>
      | undefined;
    if (!newVal) return;

    // Synchronous merge for immediate UI updates — never inject ciphertext or
    // the "***" sentinel into live form state (that resets focused inputs).
    const merged = deepMerge(
      DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      newVal as Record<string, unknown>,
    ) as unknown as ExtensionSettings;
    const prev = useSettingsStore.getState();
    useSettingsStore.setState(preserveInMemoryApiKeys(prev, merged));

    // Async reload to decrypt any encrypted fields (e.g. apiKey)
    useSettingsStore.getState().loadFromStorage().catch(() => {});
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** Convenience hooks for common selectors */
export function useSettings(): ExtensionSettings {
  return useSettingsStore((s) => extractSettings(s));
}

export function useTheme(): ThemeName {
  return useSettingsStore((s) => s.theme);
}

export function useProvider(): ProviderConfig {
  return useSettingsStore((s) => s.provider);
}

/** Extract plain ExtensionSettings from store state (strips store methods) */
function extractSettings(state: SettingsState | ExtensionSettings): ExtensionSettings {
  return {
    provider: state.provider,
    onboarding: state.onboarding,
    sourceLanguage: state.sourceLanguage,
    targetLanguage: state.targetLanguage,
    displayMode: state.displayMode,
    maxBatchChars: state.maxBatchChars,
    cacheTTLDays: state.cacheTTLDays,
    maxCacheSizeMB: state.maxCacheSizeMB,
    theme: state.theme,
    translationPosition: state.translationPosition,
    darkMode: state.darkMode,
    siteRules: state.siteRules,
    globalExcludeSelectors: state.globalExcludeSelectors,
    glossary: state.glossary,
    namedGlossaryLists: state.namedGlossaryLists,
    subtitleListBySite: state.subtitleListBySite,
    subtitleSettings: state.subtitleSettings,
    customSystemPrompt: state.customSystemPrompt,
    debugMode: state.debugMode,
    textSelectionEnabled: state.textSelectionEnabled,
    selectionDictionaryEnabled: state.selectionDictionaryEnabled,
    hoverTranslateEnabled: state.hoverTranslateEnabled,
    hoverDelay: state.hoverDelay,
    inlineTranslate: state.inlineTranslate,
    customTheme: state.customTheme,
    enableContextAwareTranslation: state.enableContextAwareTranslation,
    enableLLMPageCategoryDetection: state.enableLLMPageCategoryDetection,
    llmCategoryDetectionMode: state.llmCategoryDetectionMode,
    enableSmartExcludes: state.enableSmartExcludes,
    pdfSettings: state.pdfSettings,
    scientificPdf: state.scientificPdf,
    maxRpm: state.maxRpm,
    providers: state.providers,
    enableRichTranslate: state.enableRichTranslate,
    enableCompactInlineForShortText: state.enableCompactInlineForShortText,
    enableSourceLanguageDetection: state.enableSourceLanguageDetection,
    enableFailureCache: state.enableFailureCache,
    failureCacheTtlMinutes: state.failureCacheTtlMinutes,
    enableStreamingTranslation: state.enableStreamingTranslation,
    enableWebResume: state.enableWebResume,
    maxTextGroupLengthPerRequest: state.maxTextGroupLengthPerRequest,
    maxTextLengthPerRequest: state.maxTextLengthPerRequest,
    enableBodyTagWhitelist: state.enableBodyTagWhitelist,
    enableAsideCaps: state.enableAsideCaps,
    enableAdaptiveBatching: state.enableAdaptiveBatching,
    cacheKeyIncludesModel: state.cacheKeyIncludesModel,
    enableTranslationQualityCheck: state.enableTranslationQualityCheck,
    enableLayoutContainment: state.enableLayoutContainment,
    enableShadowDomWalk: state.enableShadowDomWalk,
    tts: state.tts,
  };
}
