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
    set(partial);
  },

  updateSetting: async (partial) => {
    await updateSettingsInStorage(partial);
    set(partial);
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

    // Synchronous merge for immediate UI updates — but strip the encrypted
    // apiKey so it doesn't briefly flash in UI before async decryption.
    const merged = deepMerge(
      DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      newVal as Record<string, unknown>,
    ) as unknown as ExtensionSettings;
    if (merged.provider?.apiKey) {
      merged.provider = { ...merged.provider, apiKey: '' };
    }
    useSettingsStore.setState(merged);

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
    glossary: state.glossary,
    subtitleSettings: state.subtitleSettings,
    customSystemPrompt: state.customSystemPrompt,
    debugMode: state.debugMode,
    textSelectionEnabled: state.textSelectionEnabled,
    hoverTranslateEnabled: state.hoverTranslateEnabled,
    hoverDelay: state.hoverDelay,
    inlineTranslate: state.inlineTranslate,
    customTheme: state.customTheme,
    enableContextAwareTranslation: state.enableContextAwareTranslation,
    enableLLMPageCategoryDetection: state.enableLLMPageCategoryDetection,
    llmCategoryDetectionMode: state.llmCategoryDetectionMode,
  };
}
