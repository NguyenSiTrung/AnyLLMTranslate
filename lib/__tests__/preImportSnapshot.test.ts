/**
 * Tests: pre-import snapshot slot (save/load/clear) with keys encrypted at rest.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { savePreImportSnapshot, loadPreImportSnapshot, clearPreImportSnapshot } from '../config';
import { STORAGE_KEYS } from '../constants';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '@/types/config';

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

  it('saves full settings with encrypted keys under the snapshot key', async () => {
    await savePreImportSnapshot(settingsWithKeys());
    expect(mockSet).toHaveBeenCalledTimes(1);
    const data = mockSet.mock.calls[0]?.[0] as Record<string, unknown>;
    const stored = data[STORAGE_KEYS.PRE_IMPORT_SNAPSHOT] as ExtensionSettings;
    expect(stored).toBeTruthy();
    expect(stored.provider.apiKey).toBe('enc:legacy-secret');
    expect(stored.providers[0]?.keys[0]?.apiKey).toBe('enc:sk-secret');
  });

  it('loads and decrypts the snapshot', async () => {
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
  });

  it('returns null when nothing is stored', async () => {
    mockGet.mockResolvedValue({});
    expect(await loadPreImportSnapshot()).toBeNull();
  });

  it('returns null when storage read fails', async () => {
    mockGet.mockRejectedValue(new Error('storage gone'));
    expect(await loadPreImportSnapshot()).toBeNull();
  });

  it('clears the snapshot', async () => {
    await clearPreImportSnapshot();
    expect(mockRemove).toHaveBeenCalledWith(STORAGE_KEYS.PRE_IMPORT_SNAPSHOT);
  });
});
