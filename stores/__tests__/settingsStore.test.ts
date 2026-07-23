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
    useSettingsStore.setState({ ...DEFAULT_SETTINGS, isLoaded: false });
    for (const k of Object.keys(mockStorageData)) {
      Reflect.deleteProperty(mockStorageData, k);
    }
    vi.clearAllMocks();
    mockListeners.length = 0;
  });

  describe('core CRUD', () => {
    it('starts from defaults, loads/merges storage, updates, and resets', async () => {
      const initial = useSettingsStore.getState();
      expect(initial.theme).toBe('blockquote');
      expect(initial.targetLanguage).toBe('vi');
      expect(initial.provider.preset).toBe('custom');
      expect(initial.isLoaded).toBe(false);
      expect(initial.subtitleSettings.fontFamily).toBe('system');
      expect(initial.subtitleSettings.displayMode).toBe('bilingual');
      expect(initial.subtitleSettings.translationTimeout).toBe(30);
      expect(DEFAULT_SETTINGS.maxRpm).toBe(20);

      mockStorageData['anyllm-translate-settings'] = {
        theme: 'bubble',
        targetLanguage: 'ja',
        maxRpm: 60,
        subtitleSettings: { fontFamily: 'serif', displayMode: 'translation-only', translationTimeout: 60 },
      };
      await useSettingsStore.getState().loadFromStorage();
      let state = useSettingsStore.getState();
      expect(state.theme).toBe('bubble');
      expect(state.targetLanguage).toBe('ja');
      expect(state.maxRpm).toBe(60);
      expect(state.subtitleSettings.fontFamily).toBe('serif');
      expect(state.subtitleSettings.position).toBe('bottom'); // default merge
      expect(state.isLoaded).toBe(true);

      // empty storage → defaults
      for (const k of Object.keys(mockStorageData)) Reflect.deleteProperty(mockStorageData, k);
      useSettingsStore.setState({ ...DEFAULT_SETTINGS, isLoaded: false });
      await useSettingsStore.getState().loadFromStorage();
      expect(useSettingsStore.getState().theme).toBe('blockquote');
      expect(useSettingsStore.getState().isLoaded).toBe(true);

      await useSettingsStore.getState().updateSettings({ theme: 'shadow-card', maxRpm: 30 });
      await useSettingsStore.getState().updateProvider({ model: 'llama3' });
      state = useSettingsStore.getState();
      expect(state.theme).toBe('shadow-card');
      expect(state.maxRpm).toBe(30);
      expect(state.provider.model).toBe('llama3');
      expect(chrome.storage.local.set).toHaveBeenCalled();

      await useSettingsStore.getState().resetToDefaults();
      state = useSettingsStore.getState();
      expect(state.theme).toBe('blockquote');
      expect(state.targetLanguage).toBe('vi');
      expect(state.maxRpm).toBe(DEFAULT_SETTINGS.maxRpm);
      expect(state.isLoaded).toBe(true);
    });
  });

  describe('initStorageSync', () => {
    it('registers listener, applies local changes, ignores non-local, and cleans up', () => {
      const cleanup = initStorageSync();
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
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
      expect(useSettingsStore.getState().theme).toBe('paper');
      expect(useSettingsStore.getState().targetLanguage).toBe('ko');

      listener(
        {
          'anyllm-translate-settings': {
            newValue: { theme: 'bubble' },
            oldValue: DEFAULT_SETTINGS,
          },
        },
        'sync',
      );
      expect(useSettingsStore.getState().theme).toBe('paper');

      cleanup();
      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalled();
    });
  });

  describe('subtitleSettings', () => {
    it('deep-merges missing fields, persists nested toggles, and syncs from storage', async () => {
      mockStorageData['anyllm-translate-settings'] = {
        subtitleSettings: { position: 'top', fontSize: 20, backgroundOpacity: 0.5, enabled: true },
      };
      await useSettingsStore.getState().loadFromStorage();
      let state = useSettingsStore.getState();
      expect(state.subtitleSettings.position).toBe('top');
      expect(state.subtitleSettings.fontFamily).toBe('system');
      expect(state.subtitleSettings.youtubeAsrResegment).toEqual({ enable: true, aiEnable: false });

      await useSettingsStore.getState().updateSettings({
        subtitleSettings: {
          ...DEFAULT_SETTINGS.subtitleSettings,
          fontFamily: 'monospace',
          translationTimeout: 90,
          youtubeAsrResegment: { enable: false, aiEnable: true },
        },
      });
      state = useSettingsStore.getState();
      expect(state.subtitleSettings.fontFamily).toBe('monospace');
      expect(state.subtitleSettings.translationTimeout).toBe(90);
      expect(state.subtitleSettings.youtubeAsrResegment).toEqual({ enable: false, aiEnable: true });

      initStorageSync();
      mockListeners[0](
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
      state = useSettingsStore.getState();
      expect(state.subtitleSettings.fontFamily).toBe('serif');
      expect(state.subtitleSettings.displayMode).toBe('translation-only');
      expect(state.subtitleSettings.translationTimeout).toBe(45);
    });
  });

  describe('providers — multi-provider pool', () => {
    it('defaults to one pool slot, persists updates, and preserves in-memory apiKeys on sync', async () => {
      expect(DEFAULT_SETTINGS.providers).toHaveLength(1);
      expect(DEFAULT_SETTINGS.providers[0]?.keys).toHaveLength(1);
      expect(useSettingsStore.getState().providers).toHaveLength(1);

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
            keys: [{ id: 'k1', apiKey: 'sk-secret', maxRpm: 60, concurrencyLimit: 0, interval: 0, enabled: true }],
          },
        ],
      });
      expect(useSettingsStore.getState().providers[0]?.keys[0]?.apiKey).toBe('sk-secret');

      initStorageSync();
      mockListeners[0](
        {
          'anyllm-translate-settings': {
            newValue: {
              providers: [
                {
                  id: 'p1',
                  enabled: true,
                  keys: [
                    { id: 'k1', apiKey: 'enc:leak-attempt-1', maxRpm: 30, concurrencyLimit: 0, priority: 0, enabled: true },
                    { id: 'k2', apiKey: 'enc:leak-attempt-2', maxRpm: 0, concurrencyLimit: 0, priority: 0, enabled: true },
                  ],
                },
              ],
            },
            oldValue: DEFAULT_SETTINGS,
          },
        },
        'local',
      );
      // Existing key keeps prior plaintext (never flash ciphertext / "***").
      expect(useSettingsStore.getState().providers[0]?.keys[0]?.apiKey).toBe('sk-secret');
      // Brand-new key id with no prior plaintext stays blank until decrypt reload.
      expect(useSettingsStore.getState().providers[0]?.keys[1]?.apiKey).toBe('');
      expect(useSettingsStore.getState().providers[0]?.keys[0]?.maxRpm).toBe(30);

      mockListeners[0](
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
