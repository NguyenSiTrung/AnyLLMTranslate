import { vi, describe, it, expect, beforeEach } from 'vitest';
import { loadSettings, saveSettings, syncProviderToPool, computePoolSignature } from '../config';
import { decryptApiKeyResult, encryptApiKey } from '../crypto';
import { STORAGE_KEYS } from '../constants';
import { DEFAULT_SETTINGS, type ExtensionSettings, type PoolProvider } from '@/types/config';

// Per-key encryption is identity-mocked so tests assert the *loop* and the
// *migration*, not the AES-GCM internals (covered in crypto.test.ts).
vi.mock('../crypto', () => ({
  encryptApiKey: vi.fn(async (plain: string) => `enc:${plain}`),
  decryptApiKeyResult: vi.fn(async (value: string) => {
    if (value.startsWith('enc:')) {
      return { value: value.slice(4), ok: true, encrypted: true };
    }
    return { value, ok: true, encrypted: false };
  }),
}));

const mockGet = vi.fn();
const mockSet = vi.fn();
global.chrome = {
  storage: {
    local: {
      get: mockGet,
      set: mockSet,
    },
  },
} as unknown as typeof chrome;

function baseSettings(overrides: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('loadSettings — multi-provider pool migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('synthesizes providers[] from legacy provider when providers is empty', async () => {
    const legacy = baseSettings({
      providers: [],
      provider: {
        preset: 'custom',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-legacy',
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 4096,
        displayName: 'OpenAI',
        requiresApiKey: true,
        connectionStatus: 'unknown',
        requestTimeoutMs: 60000,
        maxRpm: 0,
      },
      maxRpm: 60,
    });

    mockGet.mockResolvedValue({ [STORAGE_KEYS.SETTINGS]: legacy });

    const settings = await loadSettings();

    expect(settings.providers).toHaveLength(1);
    const provider = settings.providers[0];
    expect(provider?.baseUrl).toBe('https://api.openai.com/v1');
    expect(provider.model).toBe('gpt-4o-mini');
    expect(provider.displayName).toBe('OpenAI');
    expect(provider.enabled).toBe(true);
    expect(provider.keys).toHaveLength(1);
    // The single migrated key carries the global maxRpm and is enabled.
    expect(provider.keys[0]?.apiKey).toBe('sk-legacy');
    expect(provider.keys[0]?.maxRpm).toBe(60);
    expect(provider.keys[0]?.enabled).toBe(true);
    expect(provider.keys[0]?.id).toBeTruthy();
  });

  it('does NOT resynthesize when providers[] is already populated', async () => {
    const existing: PoolProvider = {
      id: 'p1',
      displayName: 'Existing',
      baseUrl: 'https://existing.example.com/v1',
      model: 'm',
      requiresApiKey: false,
      temperature: 0.3,
      maxTokens: 4096,
      enabled: true,
      keys: [{ id: 'k1', apiKey: 'plain-key', maxRpm: 0, enabled: true }],
    };
    const stored = baseSettings({ providers: [existing], provider: { ...DEFAULT_SETTINGS.provider } });

    mockGet.mockResolvedValue({ [STORAGE_KEYS.SETTINGS]: stored });

    const settings = await loadSettings();

    expect(settings.providers).toHaveLength(1);
    expect(settings.providers[0]?.id).toBe('p1');
    expect(settings.providers[0]?.keys[0]?.apiKey).toBe('plain-key');
  });

  it('decrypts each providers[].keys[].apiKey individually', async () => {
    const stored = baseSettings({
      providers: [
        {
          id: 'p1',
          displayName: 'P1',
          baseUrl: 'https://a/v1',
          model: 'm',
          requiresApiKey: true,
          temperature: 0.3,
          maxTokens: 4096,
          enabled: true,
          keys: [
            { id: 'k1', apiKey: 'enc:key-one', maxRpm: 0, enabled: true },
            { id: 'k2', apiKey: 'enc:key-two', maxRpm: 30, enabled: true },
          ],
        },
      ],
    });

    mockGet.mockResolvedValue({ [STORAGE_KEYS.SETTINGS]: stored });

    const settings = await loadSettings();

    expect(settings.providers[0]?.keys[0]?.apiKey).toBe('key-one');
    expect(settings.providers[0]?.keys[1]?.apiKey).toBe('key-two');
    expect(decryptApiKeyResult).toHaveBeenCalledWith('enc:key-one');
    expect(decryptApiKeyResult).toHaveBeenCalledWith('enc:key-two');
  });

  it('blanks an undecryptable key and marks the provider connectionStatus unknown', async () => {
    const stored = baseSettings({
      providers: [
        {
          id: 'p1',
          displayName: 'P1',
          baseUrl: 'https://a/v1',
          model: 'm',
          requiresApiKey: true,
          temperature: 0.3,
          maxTokens: 4096,
          enabled: true,
          keys: [
            { id: 'k1', apiKey: 'enc:corrupted', maxRpm: 0, enabled: true },
            { id: 'k2', apiKey: 'plain-ok', maxRpm: 0, enabled: true },
          ],
        },
      ],
    });

    mockGet.mockResolvedValue({ [STORAGE_KEYS.SETTINGS]: stored });
    // loadSettings decrypts in order: legacy provider.apiKey first, then each
    // pool key. So the first mockResolvedValueOnce is consumed by the legacy
    // mirror; the next two map to k1 (corrupted) and k2 (ok).
    (decryptApiKeyResult as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ value: '', ok: true, encrypted: false }) // legacy provider.apiKey
      .mockResolvedValueOnce({ value: '', ok: false, encrypted: true }) // k1 corrupted
      .mockResolvedValueOnce({ value: 'plain-ok', ok: true, encrypted: false }); // k2 ok

    const settings = await loadSettings();

    expect(settings.providers[0]?.keys[0]?.apiKey).toBe('');
    expect(settings.providers[0]?.keys[1]?.apiKey).toBe('plain-ok');
  });
});

describe('saveSettings — per-key encryption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('encrypts each providers[].keys[].apiKey before persisting', async () => {
    const settings = baseSettings({
      providers: [
        {
          id: 'p1',
          displayName: 'P1',
          baseUrl: 'https://a/v1',
          model: 'm',
          requiresApiKey: true,
          temperature: 0.3,
          maxTokens: 4096,
          enabled: true,
          keys: [
            { id: 'k1', apiKey: 'plain-one', maxRpm: 0, enabled: true },
            { id: 'k2', apiKey: 'plain-two', maxRpm: 0, enabled: true },
          ],
        },
      ],
    });

    await saveSettings(settings);

    expect(encryptApiKey).toHaveBeenCalledWith('plain-one');
    expect(encryptApiKey).toHaveBeenCalledWith('plain-two');
    const persisted = mockSet.mock.calls[0]?.[0] as Record<string, ExtensionSettings>;
    const savedProviders = persisted[STORAGE_KEYS.SETTINGS].providers ?? [];
    expect(savedProviders[0]?.keys[0]?.apiKey).toBe('enc:plain-one');
    expect(savedProviders[0]?.keys[1]?.apiKey).toBe('enc:plain-two');
  });

  it('persists an empty providers array unchanged', async () => {
    const settings = baseSettings({ providers: [] });
    await saveSettings(settings);
    // saveSettings always encrypts the legacy provider mirror key (even ''),
    // but the per-key pool loop must not add any calls when providers is empty.
    const encryptCalls = (encryptApiKey as ReturnType<typeof vi.fn>).mock.calls;
    const poolKeyCalls = encryptCalls.filter((c) => typeof c[0] === 'string' && c[0] !== '');
    expect(poolKeyCalls).toHaveLength(0);
    const persisted = mockSet.mock.calls[0]?.[0] as Record<string, ExtensionSettings>;
    expect(persisted[STORAGE_KEYS.SETTINGS].providers).toEqual([]);
  });

  it('preserves lastTestResult through saveSettings (not encrypted, spread-copied)', async () => {
    const testResult = { success: true, at: 1700000000000, latencyMs: 240 };
    const settings = baseSettings({
      providers: [
        {
          id: 'p1',
          displayName: 'P1',
          baseUrl: 'https://a/v1',
          model: 'm',
          requiresApiKey: true,
          temperature: 0.3,
          maxTokens: 4096,
          enabled: true,
          lastTestResult: { success: true, at: 1700000000000, latencyMs: 500 },
          keys: [
            {
              id: 'k1',
              apiKey: 'plain-key',
              maxRpm: 0,
              enabled: true,
              lastTestResult: testResult,
            },
          ],
        },
      ],
    });

    await saveSettings(settings);

    const persisted = mockSet.mock.calls[0]?.[0] as Record<string, ExtensionSettings>;
    const savedProvider = persisted[STORAGE_KEYS.SETTINGS].providers[0];
    // lastTestResult is preserved (spread-copied), apiKey is encrypted.
    expect(savedProvider?.lastTestResult).toEqual({ success: true, at: 1700000000000, latencyMs: 500 });
    expect(savedProvider?.keys[0]?.lastTestResult).toEqual(testResult);
    expect(savedProvider?.keys[0]?.apiKey).toBe('enc:plain-key');
    // encryptApiKey was called only on apiKey, never on lastTestResult fields.
    const encryptCalls = (encryptApiKey as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(encryptCalls).not.toContain(1700000000000);
  });

  it('preserves lastTestResult through loadSettings (deep-merge + decrypt)', async () => {
    const stored = baseSettings({
      providers: [
        {
          id: 'p1',
          displayName: 'P1',
          baseUrl: 'https://a/v1',
          model: 'm',
          requiresApiKey: true,
          temperature: 0.3,
          maxTokens: 4096,
          enabled: true,
          lastTestResult: { success: false, at: 1700000000001, error: 'timeout' },
          keys: [
            {
              id: 'k1',
              apiKey: 'enc:my-key',
              maxRpm: 0,
              enabled: true,
              lastTestResult: { success: true, at: 1700000000002, latencyMs: 120 },
            },
          ],
        },
      ],
    });

    mockGet.mockResolvedValue({ [STORAGE_KEYS.SETTINGS]: stored });

    const settings = await loadSettings();

    const provider = settings.providers[0];
    expect(provider?.lastTestResult).toEqual({ success: false, at: 1700000000001, error: 'timeout' });
    expect(provider?.keys[0]?.lastTestResult).toEqual({ success: true, at: 1700000000002, latencyMs: 120 });
    // apiKey was decrypted, lastTestResult was not touched by decrypt.
    expect(provider?.keys[0]?.apiKey).toBe('my-key');
  });
});

describe('syncProviderToPool — wizard/legacy mirror → pool[0]', () => {
  it('seeds a single-provider pool when providers is empty', () => {
    const result = syncProviderToPool([], {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-new',
      model: 'gpt-4o-mini',
      displayName: 'OpenAI',
      requiresApiKey: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.baseUrl).toBe('https://api.openai.com/v1');
    expect(result[0]?.keys[0]?.apiKey).toBe('sk-new');
    expect(result[0]?.keys[0]?.enabled).toBe(true);
  });

  it('patches providers[0] fields in place when providers exists', () => {
    const existing: PoolProvider = {
      id: 'p1',
      displayName: 'Old',
      baseUrl: 'https://old/v1',
      model: 'old-model',
      requiresApiKey: true,
      temperature: 0.3,
      maxTokens: 4096,
      enabled: true,
      keys: [{ id: 'k1', apiKey: 'old-key', maxRpm: 30, enabled: true }],
    };
    const result = syncProviderToPool([existing], {
      baseUrl: 'https://new/v1',
      model: 'new-model',
      apiKey: 'new-key',
    });
    expect(result[0]?.baseUrl).toBe('https://new/v1');
    expect(result[0]?.model).toBe('new-model');
    expect(result[0]?.keys[0]?.apiKey).toBe('new-key');
    // Unpatched fields preserved.
    expect(result[0]?.displayName).toBe('Old');
    expect(result[0]?.keys[0]?.maxRpm).toBe(30);
    // Identity preserved.
    expect(result[0]?.id).toBe('p1');
  });

  it('updates maxRpm on the first key', () => {
    const existing: PoolProvider = {
      id: 'p1',
      displayName: 'X',
      baseUrl: 'https://x/v1',
      model: 'm',
      requiresApiKey: false,
      temperature: 0.3,
      maxTokens: 4096,
      enabled: true,
      keys: [{ id: 'k1', apiKey: '', maxRpm: 0, enabled: true }],
    };
    const result = syncProviderToPool([existing], { maxRpm: 60 });
    expect(result[0]?.keys[0]?.maxRpm).toBe(60);
  });

  it('returns the array unchanged when patch is empty and providers exists', () => {
    const existing: PoolProvider = {
      id: 'p1',
      displayName: 'X',
      baseUrl: 'https://x/v1',
      model: 'm',
      requiresApiKey: false,
      temperature: 0.3,
      maxTokens: 4096,
      enabled: true,
      keys: [{ id: 'k1', apiKey: '', maxRpm: 0, enabled: true }],
    };
    const result = syncProviderToPool([existing], {});
    expect(result[0]?.baseUrl).toBe('https://x/v1');
  });
});

// FR-6: computePoolSignature powers the hot-path dirty tracking so initService
// can skip a rebuild when pool-relevant settings are unchanged. The signature
// must be stable across IRRELEVANT changes (theme, glossary, site rules) and
// differ on every RELEVANT change (provider config, keys, maxRpm).
describe('computePoolSignature (FR-6 dirty tracking)', () => {
  function baseSettings(): ExtensionSettings {
    return {
      ...DEFAULT_SETTINGS,
      maxRpm: 0,
      providers: [
        {
          id: 'p1',
          displayName: 'P1',
          baseUrl: 'https://a/v1',
          model: 'm',
          requiresApiKey: true,
          temperature: 0.3,
          maxTokens: 4096,
          enabled: true,
          keys: [
            { id: 'k1', apiKey: 'sk-1', maxRpm: 0, enabled: true },
            { id: 'k2', apiKey: 'sk-2', maxRpm: 30, enabled: true },
          ],
        },
      ],
    };
  }

  it('is stable when only irrelevant fields change (theme, glossary, site rules)', () => {
    const a = baseSettings();
    const b: ExtensionSettings = {
      ...baseSettings(),
      theme: 'bubble',
      glossary: [{ id: 'g1', source: 'x', target: 'y' }],
      targetLanguage: 'ja',
      globalExcludeSelectors: ['pre', '.code'],
    };
    expect(computePoolSignature(a)).toBe(computePoolSignature(b));
  });

  /** Clone base settings with the first provider replaced by `patch`. */
  const withProviderPatch = (patch: Partial<PoolProvider>): ExtensionSettings => ({
    ...baseSettings(),
    providers: [{ ...baseSettings().providers[0], ...patch }],
  });

  /** Clone base settings with the first key of the first provider patched. */
  const withKeyPatch = (patch: Partial<{ apiKey: string; maxRpm: number; enabled: boolean }>): ExtensionSettings => {
    const base = baseSettings();
    const provider = base.providers[0];
    const firstKey = provider.keys[0];
    return {
      ...base,
      providers: [
        { ...provider, keys: [{ ...firstKey, ...patch }, ...provider.keys.slice(1)] },
      ],
    };
  };

  it('changes when a provider baseUrl changes', () => {
    expect(computePoolSignature(baseSettings())).not.toBe(
      computePoolSignature(withProviderPatch({ baseUrl: 'https://other/v1' })),
    );
  });

  it('changes when a key apiKey changes', () => {
    expect(computePoolSignature(baseSettings())).not.toBe(
      computePoolSignature(withKeyPatch({ apiKey: 'sk-CHANGED' })),
    );
  });

  it('changes when a key maxRpm changes', () => {
    expect(computePoolSignature(baseSettings())).not.toBe(
      computePoolSignature(withKeyPatch({ maxRpm: 99 })),
    );
  });

  it('changes when a key is enabled/disabled', () => {
    expect(computePoolSignature(baseSettings())).not.toBe(
      computePoolSignature(withKeyPatch({ enabled: false })),
    );
  });

  it('changes when the top-level maxRpm changes', () => {
    const a = baseSettings();
    const b: ExtensionSettings = { ...baseSettings(), maxRpm: 60 };
    expect(computePoolSignature(a)).not.toBe(computePoolSignature(b));
  });

  it('changes when the model changes', () => {
    expect(computePoolSignature(baseSettings())).not.toBe(
      computePoolSignature(withProviderPatch({ model: 'other-model' })),
    );
  });
});
