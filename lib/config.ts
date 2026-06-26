/**
 * Settings store — reads/writes chrome.storage.local with defaults.
 * API keys are encrypted at rest via AES-GCM.
 */

import type { ExtensionSettings, SiteRule, PoolProvider, PoolKey } from '@/types/config';
import { DEFAULT_SETTINGS, CRITICAL_GLOBAL_EXCLUDES } from '@/types/config';
import { STORAGE_KEYS } from './constants';
import { encryptApiKey, decryptApiKeyResult } from './crypto';
import { deepMerge } from './utils';
import { BUILT_IN_RULES } from './siteRules';

/**
 * FR-1 migration: if a stored settings object has a populated legacy `provider`
 * but an empty `providers[]`, synthesize a single-entry pool from the legacy
 * provider so existing users see zero behavior change after upgrade. The
 * legacy `provider` is kept as a read-only mirror.
 *
 * The single migrated key carries the global `maxRpm`. Keys are assigned a
 * stable random id so circuit-breaker state can survive rebuilds.
 */
function migrateLegacyProviderIntoPool(merged: ExtensionSettings): void {
  if (merged.providers && merged.providers.length > 0) return;
  const legacy = merged.provider;
  if (!legacy || (!legacy.baseUrl && !legacy.apiKey && !legacy.model)) {
    // Truly unconfigured — leave the pool empty (no slot to migrate).
    merged.providers = [];
    return;
  }
  const key: PoolKey = {
    id: generatePoolKeyId(),
    apiKey: legacy.apiKey,
    maxRpm: merged.maxRpm ?? 0,
    enabled: true,
  };
  const poolProvider: PoolProvider = {
    id: generatePoolProviderId(),
    displayName: legacy.displayName || 'Custom',
    baseUrl: legacy.baseUrl,
    model: legacy.model,
    requiresApiKey: legacy.requiresApiKey,
    catalogId: undefined,
    temperature: legacy.temperature,
    maxTokens: legacy.maxTokens,
    requestTimeoutMs: legacy.requestTimeoutMs,
    enabled: true,
    keys: [key],
  };
  merged.providers = [poolProvider];
}

/** Decrypt every providers[].keys[].apiKey in place. Undecryptable keys are
 *  blanked (mirrors the legacy single-key recoverable behavior at config.ts). */
async function decryptPoolKeys(merged: ExtensionSettings): Promise<void> {
  if (!merged.providers) return;
  for (const provider of merged.providers) {
    if (!provider.keys) continue;
    for (const key of provider.keys) {
      const result = await decryptApiKeyResult(key.apiKey);
      key.apiKey = result.ok ? result.value : '';
    }
  }
}

/** Encrypt every providers[].keys[].apiKey in place. Returns a deep copy so
 *  the caller's in-memory settings are never mutated with ciphertext. */
async function encryptPoolKeys(providers: PoolProvider[]): Promise<PoolProvider[]> {
  const out: PoolProvider[] = [];
  for (const provider of providers) {
    const keys: PoolKey[] = [];
    for (const key of provider.keys ?? []) {
      keys.push({ ...key, apiKey: await encryptApiKey(key.apiKey) });
    }
    out.push({ ...provider, keys });
  }
  return out;
}

/** Stable random id for pool entries (crypto.randomUUID when available). */
function generatePoolKeyId(): string {
  try {
    return `k_${crypto.randomUUID()}`;
  } catch {
    return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

function generatePoolProviderId(): string {
  try {
    return `p_${crypto.randomUUID()}`;
  } catch {
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** Exported for UI code that creates new pool entries. */
export const poolIdGenerators = {
  keyId: generatePoolKeyId,
  providerId: generatePoolProviderId,
};

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

    // Migrate: inject critical globalExcludeSelectors for existing users
    // Remove deprecated inline element excludes that break sentence structure
    const deprecatedExcludes = new Set(['code', 'kbd', '.mathjax', '.katex']);
    const storedExcludes = (stored.globalExcludeSelectors || []).filter(s => !deprecatedExcludes.has(s));
    
    const mergedExcludes = new Set([...storedExcludes, ...CRITICAL_GLOBAL_EXCLUDES]);
    merged.globalExcludeSelectors = Array.from(mergedExcludes);

    // Decrypt API key at rest (backward compat: returns plaintext if not encrypted).
    // If an encrypted value cannot be decrypted (e.g. changed extension ID or a
    // corrupted/rotated salt), blank the key so the provider surfaces a
    // recoverable not-configured state instead of using ciphertext as the key.
    const decrypted = await decryptApiKeyResult(merged.provider.apiKey);
    merged.provider.apiKey = decrypted.ok ? decrypted.value : '';
    if (decrypted.encrypted && !decrypted.ok) {
      merged.provider.connectionStatus = 'unknown';
    }

    // FR-1: Migrate legacy provider → pool, then decrypt per-key API keys.
    migrateLegacyProviderIntoPool(merged);
    await decryptPoolKeys(merged);

    // Migrate legacy preset: 'ollama' → 'custom' (Ollama is OpenAI-compatible)
    if ((merged.provider.preset as string) === 'ollama') {
      merged.provider.preset = 'custom';
    }

    // Migrate removed Langflow preset → custom (user must reconfigure base URL / model)
    if ((merged.provider.preset as string) === 'langflow') {
      merged.provider.preset = 'custom';
      merged.provider.displayName = 'Custom';
      merged.provider.connectionStatus = 'unknown';
    }

    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Save settings to chrome.storage.local */
export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  // Encrypt per-key API keys (and the legacy mirror key) at rest.
  const encryptedProviders = await encryptPoolKeys(settings.providers ?? []);
  const encrypted = {
    ...settings,
    provider: {
      ...settings.provider,
      apiKey: await encryptApiKey(settings.provider.apiKey),
    },
    providers: encryptedProviders,
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
      // P2: deep-merge with DEFAULT_SETTINGS so partial storage updates (which
      // may omit nested objects like provider/subtitleSettings) don't lose
      // nested fields. Shallow spread previously replaced nested objects whole.
      callback(
        deepMerge(
          DEFAULT_SETTINGS as unknown as Record<string, unknown>,
          newVal as unknown as Record<string, unknown>,
        ) as unknown as ExtensionSettings,
        deepMerge(
          DEFAULT_SETTINGS as unknown as Record<string, unknown>,
          oldVal as unknown as Record<string, unknown>,
        ) as unknown as ExtensionSettings,
      );
    }
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
