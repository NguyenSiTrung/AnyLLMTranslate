/**
 * Zustand settings store — reactive state management for extension settings.
 * Syncs with chrome.storage.local and listens for cross-context changes.
 */

import { create } from 'zustand';
import type { ExtensionSettings, ThemeName } from '@/types/config';
import { DEFAULT_SETTINGS } from '@/types/config';
import { STORAGE_KEYS } from '@/lib/constants';
import type { ProviderConfig } from '@/types/config';

interface SettingsState extends ExtensionSettings {
  /** Whether the store has loaded from storage */
  isLoaded: boolean;
  /** Load settings from chrome.storage.local */
  loadFromStorage: () => Promise<void>;
  /** Update partial settings (merges and persists) */
  updateSettings: (partial: Partial<ExtensionSettings>) => Promise<void>;
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
      const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
      const stored = result[STORAGE_KEYS.SETTINGS] as Partial<ExtensionSettings> | undefined;

      if (stored) {
        set({
          ...DEFAULT_SETTINGS,
          ...stored,
          provider: {
            ...DEFAULT_SETTINGS.provider,
            ...stored.provider,
          },
          subtitleSettings: {
            ...DEFAULT_SETTINGS.subtitleSettings,
            ...stored.subtitleSettings,
          },
          isLoaded: true,
        });
      } else {
        set({ isLoaded: true });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  updateSettings: async (partial) => {
    const current = get();
    const updated: ExtensionSettings = {
      provider: current.provider,
      sourceLanguage: current.sourceLanguage,
      targetLanguage: current.targetLanguage,
      displayMode: current.displayMode,
      maxBatchChars: current.maxBatchChars,
      cacheTTLDays: current.cacheTTLDays,
      maxCacheSizeMB: current.maxCacheSizeMB,
      theme: current.theme,
      translationPosition: current.translationPosition,
      darkMode: current.darkMode,
      siteRules: current.siteRules,
      glossary: current.glossary,
      subtitleSettings: current.subtitleSettings,
      customSystemPrompt: current.customSystemPrompt,
      debugMode: current.debugMode,
      ...partial,
    };

    set(partial);
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
  },

  updateProvider: async (partial) => {
    const current = get();
    const provider = { ...current.provider, ...partial };
    const updated = extractSettings(current);
    updated.provider = provider;

    set({ provider });
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
  },

  resetToDefaults: async () => {
    set({ ...DEFAULT_SETTINGS, isLoaded: true });
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS });
  },
}));

/** Listen for storage changes from other contexts (popup, options, content) */
export function initStorageSync(): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local' || !changes[STORAGE_KEYS.SETTINGS]) return;

    const newVal = changes[STORAGE_KEYS.SETTINGS].newValue as Partial<ExtensionSettings> | undefined;
    if (newVal) {
      useSettingsStore.setState({
        ...DEFAULT_SETTINGS,
        ...newVal,
        provider: {
          ...DEFAULT_SETTINGS.provider,
          ...newVal.provider,
        },
        subtitleSettings: {
          ...DEFAULT_SETTINGS.subtitleSettings,
          ...newVal.subtitleSettings,
        },
      });
    }
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
  };
}
