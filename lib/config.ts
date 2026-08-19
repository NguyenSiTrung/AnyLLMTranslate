/**
 * Settings store — reads/writes chrome.storage.local with defaults.
 * API keys are encrypted at rest via AES-GCM.
 */

import type { ExtensionSettings, SiteRule, PoolProvider, PoolKey, ProviderConfig } from '@/types/config';
import {
  DEFAULT_SETTINGS,
  CRITICAL_GLOBAL_EXCLUDES,
  DEFAULT_KEY_MAX_RPM,
  DEFAULT_KEY_CONCURRENCY_LIMIT,
  DEFAULT_KEY_INTERVAL_MS,
  DEFAULT_THINKING_EFFORT,
  defaultPoolKeyThrottle,
} from '@/types/config';
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
 *
 * We migrate whenever a legacy `provider` object exists (even if its fields
 * are partial/empty) so the pool is always the source of truth for dispatch —
 * this preserves backward compatibility with code paths and tests that relied
 * on a single always-present provider slot.
 */
function migrateLegacyProviderIntoPool(merged: ExtensionSettings): void {
  if (merged.providers && merged.providers.length > 0) return;
  if (!merged.provider) {
    merged.providers = [];
    return;
  }
  const legacy = merged.provider;
  const key: PoolKey = {
    id: generatePoolKeyId(),
    apiKey: legacy.apiKey,
    ...defaultPoolKeyThrottle(),
    // Legacy unlimited (0 / missing) upgrades to the safe default; a positive
    // global maxRpm is preserved as the user's intentional limit.
    maxRpm:
      typeof merged.maxRpm === 'number' && merged.maxRpm > 0
        ? merged.maxRpm
        : DEFAULT_KEY_MAX_RPM,
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

/**
 * One-time upgrade: keys still on the pre-safe unlimited triple (all 0) get
 * {@link defaultPoolKeyThrottle}. Gated by `safeKeyThrottleMigrated` so a user
 * who later chooses unlimited (0) is not reset on every load.
 */
function migrateSafeKeyThrottleDefaults(merged: ExtensionSettings): void {
  if (merged.safeKeyThrottleMigrated) return;

  for (const provider of merged.providers ?? []) {
    for (const key of provider.keys ?? []) {
      const rpm = key.maxRpm ?? 0;
      const concurrency = key.concurrencyLimit ?? 0;
      const interval = key.interval ?? 0;
      // Only the old "everything unlimited" fingerprint — leave any tuned key alone.
      if (rpm === 0 && concurrency === 0 && interval === 0) {
        key.maxRpm = DEFAULT_KEY_MAX_RPM;
        key.concurrencyLimit = DEFAULT_KEY_CONCURRENCY_LIMIT;
        key.interval = DEFAULT_KEY_INTERVAL_MS;
      }
    }
  }

  if (!merged.maxRpm || merged.maxRpm <= 0) {
    merged.maxRpm = DEFAULT_KEY_MAX_RPM;
  }
  if (merged.provider && (!merged.provider.maxRpm || merged.provider.maxRpm <= 0)) {
    merged.provider.maxRpm = DEFAULT_KEY_MAX_RPM;
  }

  merged.safeKeyThrottleMigrated = true;
}

/**
 * Mirror a legacy {@link ProviderConfig} partial update into providers[0] so
 * the pool stays in sync when the setup wizard or legacy ProviderSection edits
 * the provider fields. If providers[] is empty, seeds a single-provider pool.
 *
 * Used by UI paths that still edit `settings.provider` (the legacy mirror) so
 * the coordinator (which reads `settings.providers`) sees the same config.
 *
 * Returns a new providers array (immutably) suitable for `updateSettings`.
 */
export function syncProviderToPool(
  providers: PoolProvider[],
  providerPatch: Partial<ProviderConfig>,
  keyPatch?: Partial<PoolKey>,
): PoolProvider[] {
  if (providers.length === 0) {
    const seeded: PoolProvider = {
      id: generatePoolProviderId(),
      displayName: providerPatch.displayName ?? 'Custom',
      baseUrl: providerPatch.baseUrl ?? '',
      model: providerPatch.model ?? '',
      requiresApiKey: providerPatch.requiresApiKey ?? false,
      temperature: providerPatch.temperature ?? 0.3,
      maxTokens: providerPatch.maxTokens ?? 4096,
      requestTimeoutMs: providerPatch.requestTimeoutMs ?? 60000,
      thinkingMode: providerPatch.thinkingMode ?? 'auto',
      thinkingEffort: providerPatch.thinkingEffort ?? DEFAULT_THINKING_EFFORT,
      enabled: true,
      keys: [
        {
          id: generatePoolKeyId(),
          apiKey: providerPatch.apiKey ?? '',
          ...defaultPoolKeyThrottle(),
          // Explicit patch (including 0 = unlimited) wins; otherwise safe default.
          ...(providerPatch.maxRpm !== undefined
            ? { maxRpm: providerPatch.maxRpm }
            : {}),
          enabled: true,
          ...keyPatch,
        },
      ],
    };
    return [seeded];
  }
  // Patch providers[0] (the wizard writes a single provider).
  const [first, ...rest] = providers;
  // Guaranteed present: providers.length > 0 was checked above, but ESLint's
  // no-non-null-assertion can't follow that, so guard explicitly.
  if (!first) return providers;
  const patchedProvider: PoolProvider = {
    ...first,
    ...(providerPatch.displayName !== undefined ? { displayName: providerPatch.displayName } : {}),
    ...(providerPatch.baseUrl !== undefined ? { baseUrl: providerPatch.baseUrl } : {}),
    ...(providerPatch.model !== undefined ? { model: providerPatch.model } : {}),
    ...(providerPatch.requiresApiKey !== undefined ? { requiresApiKey: providerPatch.requiresApiKey } : {}),
    ...(providerPatch.temperature !== undefined ? { temperature: providerPatch.temperature } : {}),
    ...(providerPatch.maxTokens !== undefined ? { maxTokens: providerPatch.maxTokens } : {}),
    ...(providerPatch.requestTimeoutMs !== undefined ? { requestTimeoutMs: providerPatch.requestTimeoutMs } : {}),
    ...(providerPatch.thinkingMode !== undefined ? { thinkingMode: providerPatch.thinkingMode } : {}),
    ...(providerPatch.thinkingEffort !== undefined
      ? { thinkingEffort: providerPatch.thinkingEffort }
      : {}),
  };
  // Editing credentials invalidates any persisted connection-test result
  // (mirrors applyProviderPatch in lib/poolTestStatus.ts).
  if (
    providerPatch.baseUrl !== undefined ||
    providerPatch.model !== undefined ||
    providerPatch.requiresApiKey !== undefined
  ) {
    delete patchedProvider.lastTestResult;
  }
  // Patch the first key (apiKey + maxRpm live on the key in the pool model).
  let patchedKeys = first.keys;
  if (
    (providerPatch.apiKey !== undefined || providerPatch.maxRpm !== undefined || keyPatch) &&
    patchedKeys.length > 0
  ) {
    const [firstKey, ...restKeys] = patchedKeys;
    const nextKey: PoolKey = {
      ...firstKey,
      ...(providerPatch.apiKey !== undefined ? { apiKey: providerPatch.apiKey } : {}),
      ...(providerPatch.maxRpm !== undefined ? { maxRpm: providerPatch.maxRpm } : {}),
      ...keyPatch,
    };
    // Changing the API key invalidates the key's persisted test result
    // (mirrors applyKeyPatch in lib/poolTestStatus.ts).
    if (providerPatch.apiKey !== undefined) {
      delete nextKey.lastTestResult;
    }
    patchedKeys = [nextKey, ...restKeys];
  }
  return [{ ...patchedProvider, keys: patchedKeys }, ...rest];
}

/** Load settings from chrome.storage.local with defaults */
export async function loadSettings(): Promise<ExtensionSettings> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const stored = result[STORAGE_KEYS.SETTINGS] as Partial<ExtensionSettings> | undefined;

    if (!stored) {
      return {
        ...DEFAULT_SETTINGS,
        // Defaults already use safe key throttle — mark migration done.
        safeKeyThrottleMigrated: true,
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

    // Same strip for per-site excludes (old built-ins listed bare `code`).
    // Block-level code remains via `pre` / `.code-block` / `.highlight`.
    const deprecatedInlineSiteExcludes = new Set(['code', 'kbd']);
    if (Array.isArray(merged.siteRules)) {
      merged.siteRules = merged.siteRules.map((rule) => ({
        ...rule,
        excludeSelectors: (rule.excludeSelectors ?? []).filter(
          (s) => !deprecatedInlineSiteExcludes.has(s),
        ),
      }));
    }

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

    // Upgrade pre-safe unlimited key throttle (0/0/0) once per install.
    const needsThrottlePersist = !merged.safeKeyThrottleMigrated;
    migrateSafeKeyThrottleDefaults(merged);

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

    // Persist one-time throttle migration so the flag sticks and later
    // intentional "unlimited" (0) choices are not re-upgraded on every load.
    if (needsThrottlePersist) {
      void saveSettings(merged).catch(() => {
        /* best-effort; next load will re-attempt migration */
      });
    }

    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * FR-6: compute a cheap signature over the pool-relevant settings so
 * {@link initService} can skip an expensive `rebuild()` when nothing affecting
 * pool dispatch changed. Covers every field the member services + rotation
 * depend on: provider identity, endpoint config, every key's credential +
 * rate-limit + enabled flag, and the top-level maxRpm. O(keys) — meant to run
 * on every translate call, so it must be fast and allocation-light.
 *
 * Returns a string (JSON of the relevant subset) suitable for `===` comparison.
 * Two settings objects with identical pool-relevant state produce identical
 * signatures; a change in any irrelevant field (theme, glossary, site rules)
 * leaves the signature unchanged.
 */
export function computePoolSignature(settings: ExtensionSettings): string {
  const providers = (settings.providers ?? []).map((p) => ({
    id: p.id,
    baseUrl: p.baseUrl,
    model: p.model,
    models: p.models ?? [],
    modelStrategy: p.modelStrategy ?? 'preferred_failover',
    requiresApiKey: p.requiresApiKey,
    temperature: p.temperature,
    maxTokens: p.maxTokens,
    requestTimeoutMs: p.requestTimeoutMs,
    maxBatchChars: p.maxBatchChars ?? 0,
    maxTextGroupCount: p.maxTextGroupCount ?? 0,
    thinkingMode: p.thinkingMode ?? 'auto',
    thinkingEffort: p.thinkingEffort ?? DEFAULT_THINKING_EFFORT,
    enabled: p.enabled,
    keys: (p.keys ?? []).map((k) => ({
      id: k.id,
      apiKey: k.apiKey,
      maxRpm: k.maxRpm,
      concurrencyLimit: k.concurrencyLimit ?? 0,
      interval: k.interval ?? 0,
      enabled: k.enabled,
    })),
  }));
  return JSON.stringify({
    providers,
    maxRpm: settings.maxRpm ?? 0,
    maxTextGroupLengthPerRequest: settings.maxTextGroupLengthPerRequest ?? 0,
    maxTextLengthPerRequest: settings.maxTextLengthPerRequest ?? 0,
  });
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

/** Snapshot full settings to the single pre-import slot (keys encrypted at rest). */
export async function savePreImportSnapshot(settings: ExtensionSettings): Promise<void> {
  const encryptedProviders = await encryptPoolKeys(settings.providers ?? []);
  const encrypted = {
    ...settings,
    provider: {
      ...settings.provider,
      apiKey: await encryptApiKey(settings.provider.apiKey),
    },
    providers: encryptedProviders,
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.PRE_IMPORT_SNAPSHOT]: encrypted });
}

/** Read the pre-import snapshot; returns null when absent or unreadable. Keys are decrypted. */
export async function loadPreImportSnapshot(): Promise<ExtensionSettings | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PRE_IMPORT_SNAPSHOT);
    const stored = result[STORAGE_KEYS.PRE_IMPORT_SNAPSHOT] as ExtensionSettings | undefined;
    if (!stored) return null;
    const decrypted: ExtensionSettings = { ...stored };
    const legacy = await decryptApiKeyResult(decrypted.provider?.apiKey ?? '');
    if (decrypted.provider) {
      decrypted.provider = { ...decrypted.provider, apiKey: legacy.ok ? legacy.value : '' };
    }
    // Freshly deserialized object — in-place decryption is safe (matches loadSettings).
    await decryptPoolKeys(decrypted);
    return decrypted;
  } catch {
    return null;
  }
}

/** Remove the pre-import snapshot (called after a successful rollback). */
export async function clearPreImportSnapshot(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.PRE_IMPORT_SNAPSHOT);
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
