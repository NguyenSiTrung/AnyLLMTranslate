/**
 * Settings store — reads/writes chrome.storage.local with defaults.
 * API keys are encrypted at rest via AES-GCM.
 */

import type { ExtensionSettings, SiteRule } from '@/types/config';
import { DEFAULT_SETTINGS } from '@/types/config';
import { STORAGE_KEYS } from './constants';
import { encryptApiKey, decryptApiKey } from './crypto';
import { deepMerge } from './utils';
import { BUILT_IN_RULES } from './siteRules';

/** Load settings from chrome.storage.local with defaults */
export async function loadSettings(): Promise<ExtensionSettings> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const stored = result[STORAGE_KEYS.SETTINGS] as Partial<ExtensionSettings> | undefined;

    if (!stored) {
      return {
        ...DEFAULT_SETTINGS,
        siteRules: BUILT_IN_RULES.map((r) => ({ ...r })),
      };
    }

    const merged = deepMerge(
      DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      stored as Record<string, unknown>,
    ) as unknown as ExtensionSettings;

    // Inject built-in site rules on first encounter (empty or never stored).
    // If the user already has custom rules, we respect their list and do not auto-inject.
    const storedSiteRules = stored.siteRules as SiteRule[] | undefined;
    if (!storedSiteRules || storedSiteRules.length === 0) {
      merged.siteRules = BUILT_IN_RULES.map((r) => ({ ...r }));
    }

    // Decrypt API key at rest (backward compat: returns plaintext if not encrypted)
    merged.provider.apiKey = await decryptApiKey(merged.provider.apiKey);

    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Save settings to chrome.storage.local */
export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  const encrypted = {
    ...settings,
    provider: {
      ...settings.provider,
      apiKey: await encryptApiKey(settings.provider.apiKey),
    },
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: encrypted });
}

/** Update partial settings (merges with existing) */
export async function updateSettings(
  partial: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const current = await loadSettings();
  const updated = deepMerge(
    current as unknown as Record<string, unknown>,
    partial as Record<string, unknown>,
  ) as unknown as ExtensionSettings;
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
