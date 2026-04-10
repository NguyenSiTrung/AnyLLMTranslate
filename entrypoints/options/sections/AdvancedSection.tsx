/**
 * Advanced Settings Section — cache, export/import, debug mode.
 */

import { useState, useCallback, useRef } from 'react';
import { Download, Upload, Trash2, Bug, HardDrive } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { DEFAULT_SETTINGS } from '@/types/config';

export function AdvancedSection() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);
  const [clearStatus, setClearStatus] = useState<'idle' | 'clearing' | 'done'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportSettings = useCallback(() => {
    const exportData = {
      provider: settings.provider,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      displayMode: settings.displayMode,
      theme: settings.theme,
      translationPosition: settings.translationPosition,
      darkMode: settings.darkMode,
      siteRules: settings.siteRules,
      glossary: settings.glossary,
      subtitleSettings: settings.subtitleSettings,
      customSystemPrompt: settings.customSystemPrompt,
      maxBatchChars: settings.maxBatchChars,
      cacheTTLDays: settings.cacheTTLDays,
      maxCacheSizeMB: settings.maxCacheSizeMB,
      debugMode: settings.debugMode,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lingua-lens-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [settings]);

  const handleImportSettings = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      const merged = { ...DEFAULT_SETTINGS, ...imported };
      await updateSettings(merged);
      alert('Settings imported successfully!');
    } catch {
      alert('Failed to import settings. Invalid JSON file.');
    }
  }, [updateSettings]);

  const handleClearCache = useCallback(async () => {
    setClearStatus('clearing');
    try {
      // Clear IndexedDB cache
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name?.includes('lingua-lens')) {
          indexedDB.deleteDatabase(db.name);
        }
      }
      setClearStatus('done');
      setTimeout(() => setClearStatus('idle'), 2000);
    } catch {
      setClearStatus('idle');
    }
  }, []);

  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-100 mb-1">Advanced</h2>
      <p className="text-sm text-zinc-500 mb-8">Cache management, data portability, and debugging tools.</p>

      <div className="space-y-6">
        {/* Cache Management */}
        <div className="border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="w-4 h-4 text-zinc-400" />
            <h3 className="text-sm font-medium text-zinc-200">Translation Cache</h3>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-zinc-900 rounded-lg p-3 text-center">
              <p className="text-lg font-semibold text-zinc-200">{settings.cacheTTLDays}d</p>
              <p className="text-[10px] text-zinc-500">TTL</p>
            </div>
            <div className="bg-zinc-900 rounded-lg p-3 text-center">
              <p className="text-lg font-semibold text-zinc-200">{settings.maxCacheSizeMB}MB</p>
              <p className="text-[10px] text-zinc-500">Max Size</p>
            </div>
            <div className="bg-zinc-900 rounded-lg p-3 text-center">
              <p className="text-lg font-semibold text-zinc-200">{settings.maxBatchChars}</p>
              <p className="text-[10px] text-zinc-500">Batch Chars</p>
            </div>
          </div>
          <button
            id="clear-cache-btn"
            onClick={handleClearCache}
            disabled={clearStatus === 'clearing'}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/30 text-red-400 text-sm rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            {clearStatus === 'clearing' ? 'Clearing...' : clearStatus === 'done' ? 'Cleared!' : 'Clear Cache'}
          </button>
        </div>

        {/* Export / Import */}
        <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-medium text-zinc-200">Settings Data</h3>
          <div className="flex gap-3">
            <button
              id="export-settings-btn"
              onClick={handleExportSettings}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" /> Export Settings
            </button>
            <button
              id="import-settings-btn"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" /> Import Settings
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportSettings(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        {/* Debug Mode */}
        <div className="flex items-center justify-between p-4 border border-zinc-800 rounded-lg">
          <div className="flex items-center gap-3">
            <Bug className="w-4 h-4 text-zinc-400" />
            <div>
              <p className="text-sm font-medium text-zinc-200">Debug Mode</p>
              <p className="text-xs text-zinc-500">Enable verbose logging in the browser console.</p>
            </div>
          </div>
          <button
            id="debug-mode-toggle"
            onClick={() => updateSettings({ debugMode: !settings.debugMode })}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              settings.debugMode ? 'bg-blue-600' : 'bg-zinc-700'
            }`}
            aria-label="Toggle debug mode"
          >
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
              settings.debugMode ? 'translate-x-5' : ''
            }`} />
          </button>
        </div>

        {/* Reset */}
        <button
          id="reset-all-settings-btn"
          onClick={() => {
            if (confirm('Reset all settings to defaults? This cannot be undone.')) {
              resetToDefaults();
            }
          }}
          className="w-full py-2.5 bg-red-600/10 hover:bg-red-600/20 border border-red-600/20 text-red-400 text-sm rounded-lg transition-colors"
        >
          Reset All Settings to Default
        </button>
      </div>
    </div>
  );
}
