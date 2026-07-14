/**
 * Session-scoped cache for loadSettings() during an active translation session (FR-5).
 * Invalidates on chrome.storage.local settings changes so Options edits still apply.
 */

import type { ExtensionSettings } from '@/types/config';
import { loadSettings } from '@/lib/config';
import { STORAGE_KEYS } from '@/lib/constants';

let cachedSettings: ExtensionSettings | null = null;
let listenerInstalled = false;
/** In-flight load so concurrent callers share one chrome.storage read. */
let inflight: Promise<ExtensionSettings> | null = null;

function installInvalidationListener(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes[STORAGE_KEYS.SETTINGS]) {
        invalidateSessionSettingsCache();
      }
    });
  } catch {
    // Content script / test environments without chrome.storage
  }
}

/** Drop the cached settings (storage change, explicit session end, or tests). */
export function invalidateSessionSettingsCache(): void {
  cachedSettings = null;
  inflight = null;
}

/** @internal Test helper — reset listener flag between tests. */
export function _resetSessionSettingsCacheForTests(): void {
  cachedSettings = null;
  inflight = null;
  listenerInstalled = false;
}

/**
 * Load settings with a session-scoped cache.
 * First call hits storage; subsequent calls return the same object until
 * invalidation (settings write) or explicit invalidate.
 */
export async function loadSettingsCached(): Promise<ExtensionSettings> {
  installInvalidationListener();
  if (cachedSettings) return cachedSettings;
  if (inflight) return inflight;

  inflight = loadSettings()
    .then((settings) => {
      cachedSettings = settings;
      inflight = null;
      return settings;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });

  return inflight;
}

/** Whether a cached value is currently held (for tests / diagnostics). */
export function hasSessionSettingsCache(): boolean {
  return cachedSettings !== null;
}
