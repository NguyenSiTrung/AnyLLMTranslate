/**
 * Advanced Settings Section — cache, export/import, debug mode.
 * Refactored with shared components, Modal, and Toast.
 */

import { useState, useCallback, useRef } from 'react';
import { Download, Upload, Trash2, Bug, HardDrive, Wrench } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { DEFAULT_SETTINGS } from '@/types/config';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Toggle } from '@/ui/Toggle';
import { Modal } from '@/ui/Modal';
import { useToast } from '@/ui/ToastProvider';

export function AdvancedSection() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);
  const [clearStatus, setClearStatus] = useState<'idle' | 'clearing' | 'done'>('idle');
  const [showResetModal, setShowResetModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { success: showSuccess, error: showError } = useToast();

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
    showSuccess('Settings exported successfully');
  }, [settings, showSuccess]);

  const handleImportSettings = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      const merged = { ...DEFAULT_SETTINGS, ...imported };
      await updateSettings(merged);
      showSuccess('Settings imported successfully!');
    } catch {
      showError('Failed to import settings. Invalid JSON file.');
    }
  }, [updateSettings, showSuccess, showError]);

  const handleClearCache = useCallback(async () => {
    setClearStatus('clearing');
    try {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name?.includes('lingua-lens')) {
          indexedDB.deleteDatabase(db.name);
        }
      }
      setClearStatus('done');
      showSuccess('Translation cache cleared');
      setTimeout(() => setClearStatus('idle'), 2000);
    } catch {
      setClearStatus('idle');
      showError('Failed to clear cache');
    }
  }, [showSuccess, showError]);

  const handleReset = useCallback(() => {
    resetToDefaults();
    setShowResetModal(false);
    showSuccess('All settings reset to defaults');
  }, [resetToDefaults, showSuccess]);

  // Calculate simple cache usage visualization
  const cacheUsagePct = Math.min(
    ((settings.cacheTTLDays / 30) * 100),
    100,
  );

  return (
    <div className="animate-fade-in-up">
      {/* Section header */}
      <Card accent="blue" className="mb-8">
        <div className="flex items-center gap-3">
          <Wrench className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Advanced</h2>
            <p className="text-xs text-zinc-500">Cache management, data portability, and debugging tools.</p>
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        {/* Cache Management */}
        <Card title="Translation Cache" icon={<HardDrive className="w-4 h-4" />} variant="bordered">
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
          {/* Cache usage bar */}
          <div className="mb-4">
            <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
              <span>Cache capacity</span>
              <span>{settings.maxCacheSizeMB}MB max</span>
            </div>
            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500/60 rounded-full transition-all duration-500"
                style={{ width: `${cacheUsagePct}%` }}
              />
            </div>
          </div>
          <Button
            id="clear-cache-btn"
            variant="danger"
            onClick={handleClearCache}
            disabled={clearStatus === 'clearing'}
            loading={clearStatus === 'clearing'}
            icon={<Trash2 className="w-4 h-4" />}
          >
            {clearStatus === 'done' ? 'Cleared!' : 'Clear Cache'}
          </Button>
        </Card>

        {/* Export / Import */}
        <Card title="Settings Data" variant="bordered">
          <div className="flex gap-3">
            <Button
              id="export-settings-btn"
              variant="secondary"
              onClick={handleExportSettings}
              icon={<Download className="w-4 h-4" />}
            >
              Export Settings
            </Button>
            <Button
              id="import-settings-btn"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              icon={<Upload className="w-4 h-4" />}
            >
              Import Settings
            </Button>
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
        </Card>

        {/* Debug Mode */}
        <Card variant="bordered" icon={<Bug className="w-4 h-4" />}>
          <Toggle
            id="debug-mode-toggle"
            checked={settings.debugMode}
            onChange={(checked) => updateSettings({ debugMode: checked })}
            label="Debug Mode"
            description="Enable verbose logging in the browser console."
          />
        </Card>

        {/* Reset */}
        <Button
          id="reset-all-settings-btn"
          variant="danger"
          className="w-full"
          onClick={() => setShowResetModal(true)}
        >
          Reset All Settings to Default
        </Button>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <Modal
          title="Reset All Settings?"
          message="This will restore all settings to their default values. Your custom dictionary, site rules, and provider configuration will be lost. This cannot be undone."
          variant="danger"
          confirmLabel="Reset Everything"
          cancelLabel="Keep Settings"
          onConfirm={handleReset}
          onCancel={() => setShowResetModal(false)}
        />
      )}
    </div>
  );
}
