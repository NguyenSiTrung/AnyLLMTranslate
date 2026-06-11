import { vi, describe, it, expect, beforeEach } from 'vitest';
import { loadSettings } from '../config';
import { decryptApiKeyResult } from '../crypto';
import { STORAGE_KEYS } from '../constants';
import { CRITICAL_GLOBAL_EXCLUDES } from '@/types/config';

vi.mock('../crypto', () => ({
  decryptApiKeyResult: vi.fn().mockResolvedValue({ value: 'test', ok: true, encrypted: false }),
  encryptApiKey: vi.fn(),
}));

// Mock chrome.storage.local
const mockGet = vi.fn();
global.chrome = {
  storage: {
    local: {
      get: mockGet,
    },
  },
} as unknown as typeof chrome;

describe('loadSettings migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('force merges CRITICAL_GLOBAL_EXCLUDES with user excludes', async () => {
    mockGet.mockResolvedValue({
      [STORAGE_KEYS.SETTINGS]: {
        globalExcludeSelectors: ['.my-custom-rule', 'pre'],
        provider: { apiKey: 'test' } // decryptApiKeyResult is mocked above
      }
    });

    const settings = await loadSettings();
    expect(settings.globalExcludeSelectors).toContain('.my-custom-rule');
    CRITICAL_GLOBAL_EXCLUDES.forEach(selector => {
      expect(settings.globalExcludeSelectors).toContain(selector);
    });
  });

  it('removes deprecated inline selectors during migration', async () => {
    mockGet.mockResolvedValue({
      [STORAGE_KEYS.SETTINGS]: {
        globalExcludeSelectors: ['code', '.my-custom-rule', 'kbd', '.mathjax', '.katex'],
        provider: { apiKey: 'test' }
      }
    });

    const settings = await loadSettings();
    expect(settings.globalExcludeSelectors).toContain('.my-custom-rule');
    expect(settings.globalExcludeSelectors).not.toContain('code');
    expect(settings.globalExcludeSelectors).not.toContain('kbd');
    expect(settings.globalExcludeSelectors).not.toContain('.mathjax');
    expect(settings.globalExcludeSelectors).not.toContain('.katex');
  });

  it('blanks the API key when an encrypted value cannot be decrypted', async () => {
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

    const settings = await loadSettings();
    expect(settings.provider.apiKey).toBe('');
    expect(settings.provider.connectionStatus).toBe('unknown');
  });
});
