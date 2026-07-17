import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn(),
}));

import { loadSettings } from '@/lib/config';
import {
  loadSettingsCached,
  invalidateSessionSettingsCache,
  hasSessionSettingsCache,
  _resetSessionSettingsCacheForTests,
} from '@/lib/sessionSettingsCache';
import { STORAGE_KEYS } from '@/lib/constants';
import { DEFAULT_SETTINGS } from '@/types/config';

describe('sessionSettingsCache', () => {
  const loadSettingsMock = loadSettings as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _resetSessionSettingsCacheForTests();
    loadSettingsMock.mockReset();
    loadSettingsMock.mockResolvedValue({ ...DEFAULT_SETTINGS, targetLanguage: 'vi' });
  });

  afterEach(() => {
    _resetSessionSettingsCacheForTests();
  });

  it('loads once, reuses cache, and coalesces concurrent first loads', async () => {
    const a = await loadSettingsCached();
    const b = await loadSettingsCached();
    expect(a.targetLanguage).toBe('vi');
    expect(b).toBe(a);
    expect(loadSettingsMock).toHaveBeenCalledTimes(1);
    expect(hasSessionSettingsCache()).toBe(true);

    _resetSessionSettingsCacheForTests();
    loadSettingsMock.mockReset();
    let resolveLoad!: (v: typeof DEFAULT_SETTINGS) => void;
    loadSettingsMock.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );

    const p1 = loadSettingsCached();
    const p2 = loadSettingsCached();
    resolveLoad({ ...DEFAULT_SETTINGS, targetLanguage: 'en' });
    const [c, d] = await Promise.all([p1, p2]);
    expect(c.targetLanguage).toBe('en');
    expect(d).toBe(c);
    expect(loadSettingsMock).toHaveBeenCalledTimes(1);
  });

  it('reloads after invalidate and clears hasSessionSettingsCache', async () => {
    await loadSettingsCached();
    invalidateSessionSettingsCache();
    expect(hasSessionSettingsCache()).toBe(false);
    loadSettingsMock.mockResolvedValue({ ...DEFAULT_SETTINGS, targetLanguage: 'fr' });
    const next = await loadSettingsCached();
    expect(next.targetLanguage).toBe('fr');
    expect(loadSettingsMock).toHaveBeenCalledTimes(2);

    // SETTINGS key is the storage key we watch for chrome.storage onChanged.
    expect(STORAGE_KEYS.SETTINGS).toBeTruthy();
    invalidateSessionSettingsCache();
    expect(hasSessionSettingsCache()).toBe(false);
  });
});
