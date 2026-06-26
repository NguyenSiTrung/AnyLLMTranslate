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
      expect(state.theme).toBe('blockquote');
      expect(state.targetLanguage).toBe('vi');
      expect(state.provider.preset).toBe('custom');
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
      expect(state.provider.preset).toBe('custom');
    });

    it('handles empty storage gracefully', async () => {
      await useSettingsStore.getState().loadFromStorage();

      const state = useSettingsStore.getState();
      expect(state.isLoaded).toBe(true);
      expect(state.theme).toBe('blockquote');
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
      expect(state.provider.preset).toBe('custom'); // Unchanged
    });
  });

  describe('resetToDefaults', () => {
    it('resets all settings to defaults', async () => {
      await useSettingsStore.getState().updateSettings({ theme: 'bubble', targetLanguage: 'ja' });
      await useSettingsStore.getState().resetToDefaults();

      const state = useSettingsStore.getState();
      expect(state.theme).toBe('blockquote');
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
      expect(state.theme).toBe('blockquote');
    });

    it('returns cleanup function that removes listener', () => {
      const cleanup = initStorageSync();
      cleanup();
      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalled();
    });
  });

  describe('subtitleSettings — new fields', () => {
    it('defaults: fontFamily=system, displayMode=bilingual, translationTimeout=30', () => {
      const state = useSettingsStore.getState();
      expect(state.subtitleSettings.fontFamily).toBe('system');
      expect(state.subtitleSettings.displayMode).toBe('bilingual');
      expect(state.subtitleSettings.translationTimeout).toBe(30);
    });

    it('loads stored subtitleSettings and deep-merges with defaults', async () => {
      mockStorageData['anyllm-translate-settings'] = {
        subtitleSettings: { fontFamily: 'serif', displayMode: 'translation-only', translationTimeout: 60 },
      };

      await useSettingsStore.getState().loadFromStorage();

      const state = useSettingsStore.getState();
      expect(state.subtitleSettings.fontFamily).toBe('serif');
      expect(state.subtitleSettings.displayMode).toBe('translation-only');
      expect(state.subtitleSettings.translationTimeout).toBe(60);
      // Existing fields preserved
      expect(state.subtitleSettings.position).toBe('bottom');
      expect(state.subtitleSettings.enabled).toBe(true);
    });

    it('merges defaults when stored subtitleSettings is missing new fields', async () => {
      mockStorageData['anyllm-translate-settings'] = {
        subtitleSettings: { position: 'top', fontSize: 20, backgroundOpacity: 0.5, enabled: true },
      };

      await useSettingsStore.getState().loadFromStorage();

      const state = useSettingsStore.getState();
      expect(state.subtitleSettings.position).toBe('top');
      expect(state.subtitleSettings.fontSize).toBe(20);
      // New fields fall back to defaults
      expect(state.subtitleSettings.fontFamily).toBe('system');
      expect(state.subtitleSettings.displayMode).toBe('bilingual');
      expect(state.subtitleSettings.translationTimeout).toBe(30);
    });

    it('updateSettings persists subtitleSettings changes', async () => {
      await useSettingsStore.getState().updateSettings({
        subtitleSettings: {
          ...DEFAULT_SETTINGS.subtitleSettings,
          fontFamily: 'monospace',
          translationTimeout: 90,
        },
      });

      const state = useSettingsStore.getState();
      expect(state.subtitleSettings.fontFamily).toBe('monospace');
      expect(state.subtitleSettings.translationTimeout).toBe(90);
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'anyllm-translate-settings': expect.objectContaining({
            subtitleSettings: expect.objectContaining({
              fontFamily: 'monospace',
              translationTimeout: 90,
            }),
          }),
        }),
      );
    });

    it('storage sync deep-merges new subtitle fields', () => {
      initStorageSync();
      const listener = mockListeners[0];

      listener(
        {
          'anyllm-translate-settings': {
            newValue: {
              subtitleSettings: {
                position: 'top',
                fontSize: 18,
                backgroundOpacity: 0.8,
                enabled: true,
                fontFamily: 'serif',
                displayMode: 'translation-only',
                translationTimeout: 45,
              },
            },
            oldValue: DEFAULT_SETTINGS,
          },
        },
        'local',
      );

      const state = useSettingsStore.getState();
      expect(state.subtitleSettings.fontFamily).toBe('serif');
      expect(state.subtitleSettings.displayMode).toBe('translation-only');
      expect(state.subtitleSettings.translationTimeout).toBe(45);
    });
  });

  describe('maxRpm — rate limiting setting', () => {
    it('defaults to 0 (unlimited)', () => {
      expect(DEFAULT_SETTINGS.maxRpm).toBe(0);
      expect(DEFAULT_SETTINGS.provider.maxRpm).toBe(0);
    });

    it('is included in the store state', () => {
      const state = useSettingsStore.getState();
      expect(state.maxRpm).toBe(0);
    });

    it('updateSettings persists maxRpm', async () => {
      await useSettingsStore.getState().updateSettings({ maxRpm: 30 });
      const state = useSettingsStore.getState();
      expect(state.maxRpm).toBe(30);
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'anyllm-translate-settings': expect.objectContaining({ maxRpm: 30 }),
        }),
      );
    });

    it('loadFromStorage preserves maxRpm from stored settings', async () => {
      mockStorageData['anyllm-translate-settings'] = { maxRpm: 60 };
      await useSettingsStore.getState().loadFromStorage();
      expect(useSettingsStore.getState().maxRpm).toBe(60);
    });

    it('loadFromStorage falls back to default (0) when maxRpm is absent', async () => {
      mockStorageData['anyllm-translate-settings'] = { theme: 'bubble' };
      await useSettingsStore.getState().loadFromStorage();
      expect(useSettingsStore.getState().maxRpm).toBe(0);
    });

    it('resetToDefaults restores maxRpm to 0', async () => {
      await useSettingsStore.getState().updateSettings({ maxRpm: 50 });
      await useSettingsStore.getState().resetToDefaults();
      expect(useSettingsStore.getState().maxRpm).toBe(0);
    });
  });

  describe('providers — multi-provider pool', () => {
    it('defaults to an empty providers array', () => {
      expect(DEFAULT_SETTINGS.providers).toEqual([]);
      expect(useSettingsStore.getState().providers).toEqual([]);
    });

    it('updateSettings persists providers array', async () => {
      await useSettingsStore.getState().updateSettings({
        providers: [
          {
            id: 'p1',
            displayName: 'OpenAI',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini',
            requiresApiKey: true,
            temperature: 0.3,
            maxTokens: 4096,
            enabled: true,
            keys: [{ id: 'k1', apiKey: 'sk-secret', maxRpm: 60, enabled: true }],
          },
        ],
      });
      const state = useSettingsStore.getState();
      expect(state.providers).toHaveLength(1);
      expect(state.providers[0]!.keys[0]!.apiKey).toBe('sk-secret');
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'anyllm-translate-settings': expect.objectContaining({
            providers: expect.arrayContaining([
              expect.objectContaining({ id: 'p1' }),
            ]),
          }),
        }),
      );
    });

    it('initStorageSync masks each providers[].keys[].apiKey to *** on cross-context change', () => {
      initStorageSync();
      const listener = mockListeners[0];

      listener(
        {
          'anyllm-translate-settings': {
            newValue: {
              providers: [
                {
                  id: 'p1',
                  enabled: true,
                  keys: [
                    { id: 'k1', apiKey: 'enc:leak-attempt-1', maxRpm: 30, enabled: true },
                    { id: 'k2', apiKey: 'enc:leak-attempt-2', maxRpm: 0, enabled: true },
                  ],
                },
              ],
            },
            oldValue: DEFAULT_SETTINGS,
          },
        },
        'local',
      );

      const state = useSettingsStore.getState();
      // The masked sentinel must replace every key's apiKey so the encrypted
      // value never briefly flashes in the UI before async decryption.
      expect(state.providers[0]!.keys[0]!.apiKey).toBe('***');
      expect(state.providers[0]!.keys[1]!.apiKey).toBe('***');
    });

    it('initStorageSync leaves an empty providers array untouched', () => {
      initStorageSync();
      const listener = mockListeners[0];

      listener(
        {
          'anyllm-translate-settings': {
            newValue: { providers: [] },
            oldValue: DEFAULT_SETTINGS,
          },
        },
        'local',
      );

      expect(useSettingsStore.getState().providers).toEqual([]);
    });
  });
});
