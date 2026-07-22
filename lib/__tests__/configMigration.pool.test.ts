import { vi, describe, it, expect, beforeEach } from 'vitest';
import { loadSettings } from '../config';
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

describe('loadSettings migration & critical global excludes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges CRITICAL_GLOBAL_EXCLUDES and handles corrupted encrypted API keys', async () => {
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
    expect(provider.keys[0]?.apiKey).toBe('sk-legacy');
  });

  it('upgrades unlimited 0/0/0 key throttle to safe defaults once', async () => {
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
    const settings = await loadSettings();
    expect(settings.providers[0].keys[0].concurrencyLimit).toBeGreaterThan(0);
  });
});
