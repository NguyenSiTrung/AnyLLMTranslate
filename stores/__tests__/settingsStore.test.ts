/**
 * Tests for Zustand settings store.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_SETTINGS } from '@/types/config';

// Mock chrome.storage before importing the store
const mockStorageData: Record<string, unknown> = {};
const mockListeners: ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void)[] = [];

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => {
        return { [key]: mockStorageData[key] };
      }),
      set: vi.fn(async (data: Record<string, unknown>) => {
        Object.assign(mockStorageData, data);
      }),
    },
    onChanged: {
      addListener: vi.fn((fn: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) => {
        mockListeners.push(fn);
      }),
      removeListener: vi.fn((fn: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) => {
        const idx = mockListeners.indexOf(fn);
        if (idx >= 0) mockListeners.splice(idx, 1);
      }),
    },
  },
});

// Import after mock
import { useSettingsStore, initStorageSync } from '@/stores/settingsStore';

describe('useSettingsStore', () => {
  beforeEach(() => {
    // Reset store to defaults
    useSettingsStore.setState({ ...DEFAULT_SETTINGS, isLoaded: false });
    // Clear mock storage
    for (const k of Object.keys(mockStorageData)) {
      Reflect.deleteProperty(mockStorageData, k);
    }
    vi.clearAllMocks();
    mockListeners.length = 0;
  });

  describe('initial state', () => {
    it('starts with DEFAULT_SETTINGS', () => {
      const state = useSettingsStore.getState();
      expect(state.theme).toBe('dividing-line');
      expect(state.targetLanguage).toBe('vi');
      expect(state.provider.preset).toBe('ollama');
      expect(state.isLoaded).toBe(false);
    });
  });

  describe('loadFromStorage', () => {
    it('loads stored settings and merges with defaults', async () => {
      mockStorageData['anyllm-translate-settings'] = {
        theme: 'bubble',
        targetLanguage: 'ja',
      };

      await useSettingsStore.getState().loadFromStorage();

      const state = useSettingsStore.getState();
      expect(state.theme).toBe('bubble');
      expect(state.targetLanguage).toBe('ja');
      expect(state.isLoaded).toBe(true);
      // Non-stored fields use defaults
      expect(state.provider.preset).toBe('ollama');
    });

    it('handles empty storage gracefully', async () => {
      await useSettingsStore.getState().loadFromStorage();

      const state = useSettingsStore.getState();
      expect(state.isLoaded).toBe(true);
      expect(state.theme).toBe('dividing-line');
    });
  });

  describe('updateSettings', () => {
    it('updates partial settings and persists', async () => {
      await useSettingsStore.getState().updateSettings({ theme: 'shadow-card' });

      const state = useSettingsStore.getState();
      expect(state.theme).toBe('shadow-card');
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'anyllm-translate-settings': expect.objectContaining({ theme: 'shadow-card' }),
        }),
      );
    });
  });

  describe('updateProvider', () => {
    it('updates provider config and persists', async () => {
      await useSettingsStore.getState().updateProvider({ model: 'llama3' });

      const state = useSettingsStore.getState();
      expect(state.provider.model).toBe('llama3');
      expect(state.provider.preset).toBe('ollama'); // Unchanged
    });
  });

  describe('resetToDefaults', () => {
    it('resets all settings to defaults', async () => {
      await useSettingsStore.getState().updateSettings({ theme: 'bubble', targetLanguage: 'ja' });
      await useSettingsStore.getState().resetToDefaults();

      const state = useSettingsStore.getState();
      expect(state.theme).toBe('dividing-line');
      expect(state.targetLanguage).toBe('vi');
      expect(state.isLoaded).toBe(true);
    });
  });

  describe('initStorageSync', () => {
    it('registers a storage listener', () => {
      initStorageSync();
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
    });

    it('updates store when storage changes from another context', () => {
      initStorageSync();
      const listener = mockListeners[0];

      listener(
        {
          'anyllm-translate-settings': {
            newValue: { theme: 'paper', targetLanguage: 'ko' },
            oldValue: DEFAULT_SETTINGS,
          },
        },
        'local',
      );

      const state = useSettingsStore.getState();
      expect(state.theme).toBe('paper');
      expect(state.targetLanguage).toBe('ko');
    });

    it('ignores non-local storage changes', () => {
      initStorageSync();
      const listener = mockListeners[0];

      listener(
        {
          'anyllm-translate-settings': {
            newValue: { theme: 'paper' },
            oldValue: DEFAULT_SETTINGS,
          },
        },
        'sync', // Not 'local'
      );

      const state = useSettingsStore.getState();
      expect(state.theme).toBe('dividing-line');
    });

    it('returns cleanup function that removes listener', () => {
      const cleanup = initStorageSync();
      cleanup();
      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalled();
    });
  });
});
