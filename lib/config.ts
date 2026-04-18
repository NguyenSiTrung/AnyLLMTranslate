/**
 * Settings store — reads/writes chrome.storage.local with defaults.
 */

import type { ExtensionSettings } from '@/types/config';
import { DEFAULT_SETTINGS } from '@/types/config';
import { STORAGE_KEYS } from './constants';

/** Load settings from chrome.storage.local with defaults */
export async function loadSettings(): Promise<ExtensionSettings> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const stored = result[STORAGE_KEYS.SETTINGS] as Partial<ExtensionSettings> | undefined;

    if (!stored) {
      return { ...DEFAULT_SETTINGS };
    }

    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      provider: {
        ...DEFAULT_SETTINGS.provider,
        ...stored.provider,
      },
      inlineTranslate: {
        ...DEFAULT_SETTINGS.inlineTranslate,
        ...stored.inlineTranslate,
      },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Save settings to chrome.storage.local */
export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

/** Update partial settings (merges with existing) */
export async function updateSettings(
  partial: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const current = await loadSettings();
  const updated: ExtensionSettings = {
    ...current,
    ...partial,
    provider: {
      ...current.provider,
      ...(partial.provider ?? {}),
    },
    inlineTranslate: {
      ...current.inlineTranslate,
      ...(partial.inlineTranslate ?? {}),
    },
  };
  await saveSettings(updated);
  return updated;
}

/** Listen for settings changes */
export function onSettingsChange(
  callback: (newSettings: ExtensionSettings, oldSettings: ExtensionSettings) => void,
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName === 'local' && changes[STORAGE_KEYS.SETTINGS]) {
      const newVal = changes[STORAGE_KEYS.SETTINGS].newValue as ExtensionSettings;
      const oldVal = changes[STORAGE_KEYS.SETTINGS].oldValue as ExtensionSettings;
      callback(
        { ...DEFAULT_SETTINGS, ...newVal },
        { ...DEFAULT_SETTINGS, ...oldVal },
      );
    }
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
