/**
 * Advanced Settings Section — cache, export/import, debug mode.
 * Header uses inline SectionHeader pattern (consistent with GeneralSection).
 * Cache Configuration uses FieldGroup for consistency.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Download, Upload, Trash2, HardDrive, Wrench, Database } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { DEFAULT_SETTINGS } from '@/types/config';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Toggle } from '@/ui/Toggle';
import { Modal } from '@/ui/Modal';
import { Input } from '@/ui/Input';
import { FieldGroup } from '@/ui/FieldGroup';
import { useToast } from '@/ui/ToastProvider';

export function AdvancedSection() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);
  const [clearStatus, setClearStatus] = useState<'idle' | 'clearing' | 'done'>('idle');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showClearCacheModal, setShowClearCacheModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { success: showSuccess, error: showError } = useToast();

  // Cache configuration local state
  const [cacheTTL, setCacheTTL] = useState(settings.cacheTTLDays);
  const [maxCacheSize, setMaxCacheSize] = useState(settings.maxCacheSizeMB);
  const [maxBatchChars, setMaxBatchChars] = useState(settings.maxBatchChars);
  const [cacheTTLError, setCacheTTLError] = useState('');
  const [maxCacheSizeError, setMaxCacheSizeError] = useState('');
  const [maxBatchCharsError, setMaxBatchCharsError] = useState('');

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
    a.download = `anyllm-translate-settings-${new Date().toISOString().slice(0, 10)}.json`;
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
    setShowClearCacheModal(false);
    setClearStatus('clearing');
    try {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name?.includes('anyllm-translate')) {
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

  // Sync local state with settings (for reset/import scenarios)
  useEffect(() => {
    setCacheTTL(settings.cacheTTLDays);
    setMaxCacheSize(settings.maxCacheSizeMB);
    setMaxBatchChars(settings.maxBatchChars);
  }, [settings.cacheTTLDays, settings.maxCacheSizeMB, settings.maxBatchChars]);

  // Cache configuration handlers
  const handleCacheTTLBlur = useCallback(() => {
    const value = Number(cacheTTL);
    if (value < 1 || value > 365) {
      setCacheTTLError('Must be between 1 and 365 days');
      return;
    }
    setCacheTTLError('');
    updateSettings({ cacheTTLDays: value });
  }, [cacheTTL, updateSettings]);

  const handleMaxCacheSizeBlur = useCallback(() => {
    const value = Number(maxCacheSize);
    if (value < 10 || value > 1000) {
      setMaxCacheSizeError('Must be between 10 and 1000 MB');
      return;
    }
    setMaxCacheSizeError('');
    updateSettings({ maxCacheSizeMB: value });
  }, [maxCacheSize, updateSettings]);

  const handleMaxBatchCharsBlur = useCallback(() => {
    const value = Number(maxBatchChars);
    if (value < 500 || value > 10000) {
      setMaxBatchCharsError('Must be between 500 and 10000 characters');
      return;
    }
    setMaxBatchCharsError('');
    updateSettings({ maxBatchChars: value });
  }, [maxBatchChars, updateSettings]);

  return (
    <div className="animate-fade-in-up">
      {/* Inline section header — consistent with GeneralSection */}
      <div className="sticky top-0 z-10 backdrop-blur-md bg-[#09090b]/80 pt-4 pb-4 mb-3 -mt-4 flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-600/15 border border-zinc-500/20">
          <Wrench className="w-4 h-4 text-zinc-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-100 leading-tight">Advanced</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Cache management, data portability, and debugging tools.</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Cache Management (merged: stats + configuration + clear) */}
        <div className="animate-stagger" style={{ '--stagger-delay': '0' } as React.CSSProperties}>
          <Card title="Cache Management" icon={<HardDrive className="w-3.5 h-3.5" />} variant="bordered">
            <div className="grid grid-cols-3 gap-3 mb-5">
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
            <div className="space-y-5 mb-5">
              <FieldGroup
                label="Cache TTL (days)"
                description="How long translations are cached before expiration."
                htmlFor="cache-ttl-input"
              >
                <Input
                  id="cache-ttl-input"
                  type="number"
                  value={cacheTTL}
                  onChange={(e) => setCacheTTL(Number(e.target.value))}
                  onBlur={handleCacheTTLBlur}
                  min={1}
                  max={365}
                  error={cacheTTLError}
                />
              </FieldGroup>
              <FieldGroup
                label="Max Cache Size (MB)"
                description="Maximum storage limit for the translation cache."
                htmlFor="max-cache-size-input"
              >
                <Input
                  id="max-cache-size-input"
                  type="number"
                  value={maxCacheSize}
                  onChange={(e) => setMaxCacheSize(Number(e.target.value))}
                  onBlur={handleMaxCacheSizeBlur}
                  min={10}
                  max={1000}
                  error={maxCacheSizeError}
                />
              </FieldGroup>
              <FieldGroup
                label="Max Batch Characters"
                description="Maximum characters sent per translation batch."
                htmlFor="max-batch-chars-input"
              >
                <Input
                  id="max-batch-chars-input"
                  type="number"
                  value={maxBatchChars}
                  onChange={(e) => setMaxBatchChars(Number(e.target.value))}
                  onBlur={handleMaxBatchCharsBlur}
                  min={500}
                  max={10000}
                  error={maxBatchCharsError}
                />
              </FieldGroup>
            </div>
            <Button
              id="clear-cache-btn"
              variant="danger"
              onClick={() => setShowClearCacheModal(true)}
              disabled={clearStatus === 'clearing'}
              loading={clearStatus === 'clearing'}
              icon={<Trash2 className="w-4 h-4" />}
            >
              {clearStatus === 'done' ? 'Cleared!' : 'Clear Cache'}
            </Button>
          </Card>
        </div>

        {/* Data & Developer Tools (merged: export/import + debug) */}
        <div className="animate-stagger" style={{ '--stagger-delay': '1' } as React.CSSProperties}>
          <Card title="Data & Developer Tools" icon={<Database className="w-3.5 h-3.5" />} variant="bordered">
            <div className="flex gap-3 mb-5">
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
            <div className="border-t border-zinc-800 pt-4">
              <Toggle
                id="debug-mode-toggle"
                checked={settings.debugMode}
                onChange={(checked) => updateSettings({ debugMode: checked })}
                label="Debug Mode"
                description="Enable verbose logging in the browser console."
              />
            </div>
          </Card>
        </div>

        {/* Reset */}
        <div className="animate-stagger" style={{ '--stagger-delay': '2' } as React.CSSProperties}>
          <Button
            id="reset-all-settings-btn"
            variant="danger"
            className="w-full"
            onClick={() => setShowResetModal(true)}
          >
            Reset All Settings to Default
          </Button>
        </div>
      </div>

      {/* Clear Cache Confirmation Modal */}
      {showClearCacheModal && (
        <Modal
          title="Clear Translation Cache?"
          message="This will permanently delete all cached translations. Future translations will need to be fetched again from your provider, which may incur additional API costs."
          variant="danger"
          confirmLabel="Clear Cache"
          cancelLabel="Keep Cache"
          onConfirm={handleClearCache}
          onCancel={() => setShowClearCacheModal(false)}
        />
      )}

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
