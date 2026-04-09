import { useState, useEffect, useCallback } from 'react';
import { Languages, Zap, Loader2, CheckCircle2, AlertCircle, Settings, ArrowRightLeft } from 'lucide-react';
import type { ExtensionSettings } from '@/types/config';
import type { StatusResponse, TabTranslationStatus } from '@/types/messages';
import { DEFAULT_SETTINGS, PROVIDER_PRESETS } from '@/types/config';
import { LANGUAGES } from '@/lib/languages';

/** Status display config */
const STATUS_CONFIG: Record<TabTranslationStatus, { icon: typeof Zap; label: string; color: string }> = {
  idle: { icon: Zap, label: 'Ready', color: 'text-zinc-400' },
  translating: { icon: Loader2, label: 'Translating...', color: 'text-blue-400' },
  done: { icon: CheckCircle2, label: 'Done', color: 'text-emerald-400' },
  error: { icon: AlertCircle, label: 'Error', color: 'text-red-400' },
};

export default function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<StatusResponse>({
    status: 'idle',
    translatedCount: 0,
    totalCount: 0,
  });
  const [isTranslating, setIsTranslating] = useState(false);

  // Load settings and status on mount
  useEffect(() => {
    loadSettingsFromStorage();
    queryTabStatus();
  }, []);

  async function loadSettingsFromStorage() {
    try {
      const result = await chrome.storage.local.get('lingua-lens-settings');
      if (result['lingua-lens-settings']) {
        setSettings({ ...DEFAULT_SETTINGS, ...result['lingua-lens-settings'] });
      }
    } catch {
      // Use defaults
    }
  }

  async function queryTabStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.runtime.sendMessage({ action: 'getStatus', tabId: tab.id });
        if (response) {
          setStatus(response as StatusResponse);
          setIsTranslating(response.status === 'translating');
        }
      }
    } catch {
      // Tab may not be ready
    }
  }

  const handleToggleTranslation = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      if (isTranslating || status.status === 'done') {
        // Stop / restore
        await chrome.tabs.sendMessage(tab.id, { action: 'stopTranslation' });
        setIsTranslating(false);
        setStatus({ status: 'idle', translatedCount: 0, totalCount: 0 });
      } else {
        // Start translation
        await chrome.tabs.sendMessage(tab.id, { action: 'startTranslation' });
        setIsTranslating(true);
        setStatus((prev) => ({ ...prev, status: 'translating' }));
      }
    } catch (error) {
      console.error('[LinguaLens] Toggle error:', error);
    }
  }, [isTranslating, status.status]);

  const handleSourceLanguageChange = useCallback(async (code: string) => {
    const updated = { ...settings, sourceLanguage: code };
    setSettings(updated);
    await chrome.storage.local.set({ 'lingua-lens-settings': updated });
  }, [settings]);

  const handleTargetLanguageChange = useCallback(async (code: string) => {
    const updated = { ...settings, targetLanguage: code };
    setSettings(updated);
    await chrome.storage.local.set({ 'lingua-lens-settings': updated });
  }, [settings]);

  const statusConfig = STATUS_CONFIG[status.status];
  const StatusIcon = statusConfig.icon;
  const providerPreset = PROVIDER_PRESETS.find((p) => p.preset === settings.provider.preset);
  const sourceLanguages = LANGUAGES;
  const targetLanguages = LANGUAGES.filter((l) => l.code !== 'auto');

  const isActive = isTranslating || status.status === 'done';

  return (
    <div className="w-80 bg-zinc-900 text-zinc-100 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Languages className="w-5 h-5 text-blue-400" />
          <h1 className="text-sm font-semibold tracking-tight">LinguaLens</h1>
        </div>
        <button
          className="p-1.5 rounded-md hover:bg-zinc-800 transition-colors"
          title="Settings"
          onClick={() => chrome.runtime.openOptionsPage?.()}
        >
          <Settings className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* Translation Toggle */}
      <div className="px-4 py-4">
        <button
          id="translate-toggle"
          onClick={handleToggleTranslation}
          className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
            isActive
              ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
          }`}
        >
          {status.status === 'translating' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Languages className="w-4 h-4" />
          )}
          {isActive ? 'Restore Original' : 'Translate Page'}
        </button>
      </div>

      {/* Status */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between text-xs">
          <div className={`flex items-center gap-1.5 ${statusConfig.color}`}>
            <StatusIcon className={`w-3.5 h-3.5 ${status.status === 'translating' ? 'animate-spin' : ''}`} />
            <span>{statusConfig.label}</span>
          </div>
          {(status.translatedCount > 0 || status.totalCount > 0) && (
            <span className="text-zinc-500">
              {status.translatedCount}/{status.totalCount} pieces
            </span>
          )}
        </div>
        {status.error && (
          <p className="mt-1.5 text-xs text-red-400/80 leading-tight">{status.error}</p>
        )}
      </div>

      {/* Language Pickers */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">From</label>
            <select
              id="source-language"
              value={settings.sourceLanguage}
              onChange={(e) => handleSourceLanguageChange(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none cursor-pointer"
            >
              {sourceLanguages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.nativeName}
                </option>
              ))}
            </select>
          </div>

          <ArrowRightLeft className="w-3.5 h-3.5 text-zinc-600 mt-4 shrink-0" />

          <div className="flex-1">
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">To</label>
            <select
              id="target-language"
              value={settings.targetLanguage}
              onChange={(e) => handleTargetLanguageChange(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none cursor-pointer"
            >
              {targetLanguages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.nativeName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Provider Info */}
      <div className="px-4 py-2.5 border-t border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Zap className="w-3 h-3" />
          <span>{providerPreset?.displayName ?? settings.provider.displayName}</span>
        </div>
        <span className="text-[10px] text-zinc-600 font-mono">{settings.provider.model}</span>
      </div>
    </div>
  );
}
