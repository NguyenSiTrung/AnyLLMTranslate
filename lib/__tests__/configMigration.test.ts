/**
 * Tests for lib/config: pre-import snapshot slot + loadSettings migration and
 * critical global excludes. Keys are encrypted at rest (crypto mocked).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { savePreImportSnapshot, loadPreImportSnapshot, clearPreImportSnapshot, loadSettings } from '../config';
import { decryptApiKeyResult } from '../crypto';
import { STORAGE_KEYS } from '../constants';
import { DEFAULT_SETTINGS, CRITICAL_GLOBAL_EXCLUDES, type ExtensionSettings, type PoolProvider } from '@/types/config';

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
const mockRemove = vi.fn();
global.chrome = {
  storage: {
    local: {
      get: mockGet,
      set: mockSet,
      remove: mockRemove,
    },
  },
} as unknown as typeof chrome;

function baseSettings(overrides: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function settingsWithKeys(): ExtensionSettings {
  return {
    ...DEFAULT_SETTINGS,
    provider: { ...DEFAULT_SETTINGS.provider, apiKey: 'legacy-secret' },
    providers: [
      {
        id: 'p1',
        displayName: 'P',
        baseUrl: 'https://x/v1',
        model: 'm',
        requiresApiKey: true,
        temperature: 0.3,
        maxTokens: 4096,
        enabled: true,
        keys: [
          {
            id: 'k1',
            apiKey: 'sk-secret',
            maxRpm: 20,
            concurrencyLimit: 1,
            interval: 500,
            enabled: true,
          },
        ],
      },
    ],
  };
}

describe('pre-import snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('round-trips encrypted snapshots and returns null for missing or failed storage reads', async () => {
    await savePreImportSnapshot(settingsWithKeys());
    expect(mockSet).toHaveBeenCalledTimes(1);
    const data = mockSet.mock.calls[0]?.[0] as Record<string, unknown>;
    const stored = data[STORAGE_KEYS.PRE_IMPORT_SNAPSHOT] as ExtensionSettings;
    expect(stored).toBeTruthy();
    expect(stored.provider.apiKey).toBe('enc:legacy-secret');
    expect(stored.providers[0]?.keys[0]?.apiKey).toBe('enc:sk-secret');

    const source = settingsWithKeys();
    const encrypted: ExtensionSettings = {
      ...source,
      provider: { ...source.provider, apiKey: 'enc:legacy-secret' },
      providers: source.providers.map((p) => ({
        ...p,
        keys: p.keys.map((k) => ({ ...k, apiKey: 'enc:sk-secret' })),
      })),
    };
    mockGet.mockResolvedValue({ [STORAGE_KEYS.PRE_IMPORT_SNAPSHOT]: encrypted });

    const snapshot = await loadPreImportSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot?.provider.apiKey).toBe('legacy-secret');
    expect(snapshot?.providers[0]?.keys[0]?.apiKey).toBe('sk-secret');

    await clearPreImportSnapshot();
    expect(mockRemove).toHaveBeenCalledWith(STORAGE_KEYS.PRE_IMPORT_SNAPSHOT);
    mockGet.mockResolvedValue({});
    expect(await loadPreImportSnapshot()).toBeNull();

    mockGet.mockRejectedValue(new Error('storage gone'));
    expect(await loadPreImportSnapshot()).toBeNull();
  });
});

describe('loadSettings migration & critical global excludes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges critical excludes, blanks corrupted keys, synthesizes providers, and upgrades unlimited throttles', async () => {
    // facet: merges CRITICAL_GLOBAL_EXCLUDES and handles corrupted encrypted API keys
    mockGet.mockResolvedValue({
      [STORAGE_KEYS.SETTINGS]: {
        globalExcludeSelectors: ['.my-custom-rule', 'pre', 'code', 'kbd', '.mathjax', '.katex'],
        siteRules: [
          {
            id: 'builtin-github-root',
            hostname: 'github.com',
            includeSelectors: ['.markdown-body'],
            excludeSelectors: ['.highlight', 'pre', 'code', 'kbd'],
            alwaysTranslate: false,
            neverTranslate: false,
            builtIn: true,
          },
        ],
        provider: { apiKey: 'test' },
      },
    });

    const settings = await loadSettings();
    expect(settings.globalExcludeSelectors).toContain('.my-custom-rule');
    CRITICAL_GLOBAL_EXCLUDES.forEach((selector) => {
      expect(settings.globalExcludeSelectors).toContain(selector);
    });

    // Blanking corrupted API key
    mockGet.mockResolvedValue({
      [STORAGE_KEYS.SETTINGS]: {
        provider: { apiKey: 'enc:corrupted', connectionStatus: 'success' },
      },
    });
    (decryptApiKeyResult as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      value: '',
      ok: false,
      encrypted: true,
    });
    const corruptedSettings = await loadSettings();
    expect(corruptedSettings.provider.apiKey).toBe('');

    // facet: synthesizes providers[] from legacy provider when providers is empty
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

    const synthSettings = await loadSettings();

    expect(synthSettings.providers).toHaveLength(1);
    const provider = synthSettings.providers[0];
    expect(provider?.baseUrl).toBe('https://api.openai.com/v1');
    expect(provider.model).toBe('gpt-4o-mini');
    expect(provider.keys[0]?.apiKey).toBe('sk-legacy');

    // facet: upgrades unlimited 0/0/0 key throttle to safe defaults once
    const existing: PoolProvider = {
      id: 'p1',
      displayName: 'Existing',
      baseUrl: 'https://existing.example.com/v1',
      model: 'm',
      requiresApiKey: false,
      temperature: 0.3,
      maxTokens: 4096,
      enabled: true,
      keys: [
        {
          id: 'k1',
          apiKey: 'plain-key',
          maxRpm: 0,
          concurrencyLimit: 0,
          interval: 0,
          enabled: true,
        },
      ],
    };
    mockGet.mockResolvedValue({ [STORAGE_KEYS.SETTINGS]: baseSettings({ providers: [existing] }) });
    const migratedSettings = await loadSettings();
    expect(migratedSettings.providers[0].keys[0].concurrencyLimit).toBeGreaterThan(0);
  });
});
