import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_SETTINGS } from '@/types/config';
import type { ExtensionSettings } from '@/types/config';
import { STORAGE_KEYS } from '@/lib/constants';
import { loadSettings, updateSettings } from '@/lib/config';

export function usePopupSettings() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const loaded = await loadSettings();
        if (mounted) {
          setSettings(loaded);
        }
      } catch {
        /* defaults */
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    })();

    const storageListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === 'local' && changes[STORAGE_KEYS.SETTINGS]) {
        setSettings({ ...DEFAULT_SETTINGS, ...changes[STORAGE_KEYS.SETTINGS].newValue });
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, []);

  const updateSetting = useCallback(async (partial: Partial<ExtensionSettings>) => {
    const updated = await updateSettings(partial);
    setSettings(updated);
  }, []);

  const updateSubtitleSetting = useCallback(
    async (partial: Partial<ExtensionSettings['subtitleSettings']>) => {
      const updated = await updateSettings({
        subtitleSettings: { ...settings.subtitleSettings, ...partial },
      });
      setSettings(updated);
    },
    [settings],
  );

  return { settings, updateSetting, updateSubtitleSetting, isLoading };
}
