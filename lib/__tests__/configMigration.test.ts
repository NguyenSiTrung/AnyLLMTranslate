import { vi, describe, it, expect, beforeEach } from 'vitest';
import { loadSettings } from '../config';
import { STORAGE_KEYS } from '../constants';
import { CRITICAL_GLOBAL_EXCLUDES } from '@/types/config';

// Mock chrome.storage.local
const mockGet = vi.fn();
global.chrome = {
  storage: {
    local: {
      get: mockGet,
    },
  },
} as any;

describe('loadSettings migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('force merges CRITICAL_GLOBAL_EXCLUDES with user excludes', async () => {
    mockGet.mockResolvedValue({
      [STORAGE_KEYS.SETTINGS]: {
        globalExcludeSelectors: ['.my-custom-rule', 'pre'],
        provider: { apiKey: 'test' } // to satisfy decryptApiKey which we will mock or bypass
      }
    });

    vi.mock('../crypto', () => ({
      decryptApiKey: vi.fn().mockResolvedValue('test'),
      encryptApiKey: vi.fn()
    }));

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

    vi.mock('../crypto', () => ({
      decryptApiKey: vi.fn().mockResolvedValue('test'),
      encryptApiKey: vi.fn()
    }));

    const settings = await loadSettings();
    expect(settings.globalExcludeSelectors).toContain('.my-custom-rule');
    expect(settings.globalExcludeSelectors).not.toContain('code');
    expect(settings.globalExcludeSelectors).not.toContain('kbd');
    expect(settings.globalExcludeSelectors).not.toContain('.mathjax');
    expect(settings.globalExcludeSelectors).not.toContain('.katex');
  });
});
