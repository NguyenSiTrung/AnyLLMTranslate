/**
 * Advanced Settings Section — cache, export/import, debug mode, and context features.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Download, Upload, Trash2, HardDrive, Wrench, Database, BrainCircuit, FileText } from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import { DEFAULT_SETTINGS } from '@/types/config';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Toggle } from '@/ui/Toggle';
import { Modal } from '@/ui/Modal';
import { Input } from '@/ui/Input';
import { Select } from '@/ui/Select';
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
      customTheme: settings.customTheme,
      enableContextAwareTranslation: settings.enableContextAwareTranslation,
      enableLLMPageCategoryDetection: settings.enableLLMPageCategoryDetection,
      llmCategoryDetectionMode: settings.llmCategoryDetectionMode,
      textSelectionEnabled: settings.textSelectionEnabled,
      hoverTranslateEnabled: settings.hoverTranslateEnabled,
      hoverDelay: settings.hoverDelay,
      inlineTranslate: settings.inlineTranslate,
      enableSmartExcludes: settings.enableSmartExcludes,
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
      const response = await chrome.runtime.sendMessage({ action: 'CLEAR_CACHE' });
      if (response?.success) {
        setClearStatus('done');
        showSuccess('Translation cache cleared');
      } else {
        throw new Error('Clear cache failed');
      }
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

  // Sync local state with settings
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
    if (value !== settings.cacheTTLDays) {
      updateSettings({ cacheTTLDays: value });
      showSuccess('Cache TTL updated');
    }
  }, [cacheTTL, settings.cacheTTLDays, updateSettings, showSuccess]);

  const handleMaxCacheSizeBlur = useCallback(() => {
    const value = Number(maxCacheSize);
    if (value < 10 || value > 1000) {
      setMaxCacheSizeError('Must be between 10 and 1000 MB');
      return;
    }
    setMaxCacheSizeError('');
    if (value !== settings.maxCacheSizeMB) {
      updateSettings({ maxCacheSizeMB: value });
      showSuccess('Max cache size updated');
    }
  }, [maxCacheSize, settings.maxCacheSizeMB, updateSettings, showSuccess]);

  const handleMaxBatchCharsBlur = useCallback(() => {
    const value = Number(maxBatchChars);
    if (value < 500 || value > 10000) {
      setMaxBatchCharsError('Must be between 500 and 10000 characters');
      return;
    }
    setMaxBatchCharsError('');
    if (value !== settings.maxBatchChars) {
      updateSettings({ maxBatchChars: value });
      showSuccess('Max batch characters updated');
    }
  }, [maxBatchChars, settings.maxBatchChars, updateSettings, showSuccess]);

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Advanced"
        description="Performance tuning, data portability, and intelligence settings."
        icon={<Wrench className="w-4 h-4" />}
        accentColor="zinc"
      />

      <div className="space-y-4">
        {/* Performance & Caching */}
        <div className="animate-stagger" style={stagger(0)}>
          <Card title="Performance & Caching" icon={<HardDrive className="w-3.5 h-3.5" />} variant="bordered">
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

        {/* Context & Intelligence */}
        <div className="animate-stagger" style={stagger(1)}>
          <Card title="Context & Intelligence" icon={<BrainCircuit className="w-3.5 h-3.5" />} variant="bordered">
            <div className="space-y-4">
              <Toggle
                id="context-aware-toggle"
                checked={settings.enableContextAwareTranslation}
                onChange={(checked) => updateSettings({ enableContextAwareTranslation: checked })}
                label="Context-Aware Translation"
                description="Inject page title, description, and domain into translation prompts for more consistent terminology."
              />
              
              <div className={`pt-4 border-t border-zinc-800 space-y-4 ${!settings.enableContextAwareTranslation ? 'opacity-40 pointer-events-none' : ''}`}>
                <Toggle
                  id="page-category-detection-toggle"
                  checked={settings.enableLLMPageCategoryDetection}
                  onChange={(checked) => updateSettings({ enableLLMPageCategoryDetection: checked })}
                  label="LLM-based Page Category Detection"
                  description="Auto-detect page topic using LLM for better terminology. Requires background API call."
                />
                
                {settings.enableLLMPageCategoryDetection && (
                  <div className="pl-6 border-l-2 border-zinc-800 ml-2 animate-fade-in">
                    <FieldGroup label="Detection Mode" htmlFor="llm-category-mode-select">
                      <Select
                        id="llm-category-mode-select"
                        value={settings.llmCategoryDetectionMode}
                        onChange={(e) => updateSettings({ llmCategoryDetectionMode: e.target.value as 'async' | 'blocking' })}
                        options={[
                          { value: 'async', label: 'Async (No delay, progressive context upgrade)' },
                          { value: 'blocking', label: 'Blocking (Wait for exact context before first translation)' },
                        ]}
                      />
                    </FieldGroup>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* PDF Translator */}
        <div className="animate-stagger" style={stagger(2)}>
          <Card title="PDF Translator" icon={<FileText className="w-3.5 h-3.5" />} variant="bordered">
            <div className="space-y-4">
              <FieldGroup
                label="Auto-open mode"
                description="Detect PDF tabs (including extensionless URLs like arxiv.org/pdf/2606.20543) and open the translator automatically. Default is off."
                htmlFor="pdf-auto-open-select"
              >
                <Select
                  id="pdf-auto-open-select"
                  value={settings.pdfSettings?.autoOpen ?? 'off'}
                  onChange={(e) => updateSettings({
                    pdfSettings: {
                      ...(settings.pdfSettings ?? { autoOpen: 'off', openMode: 'new-tab', neverAutoOpenSites: [] }),
                      autoOpen: e.target.value as 'off' | 'prompt' | 'auto',
                    },
                  })}
                  options={[
                    { value: 'off', label: 'Off (manual only)' },
                    { value: 'prompt', label: 'Prompt (show banner button)' },
                    { value: 'auto', label: 'Auto (open immediately)' },
                  ]}
                />
              </FieldGroup>

              <FieldGroup
                label="Open mode"
                description="New tab keeps the native viewer; same tab replaces it in place."
                htmlFor="pdf-open-mode-select"
              >
                <Select
                  id="pdf-open-mode-select"
                  value={settings.pdfSettings?.openMode ?? 'new-tab'}
                  onChange={(e) => updateSettings({
                    pdfSettings: {
                      ...(settings.pdfSettings ?? { autoOpen: 'off', openMode: 'new-tab', neverAutoOpenSites: [] }),
                      openMode: e.target.value as 'new-tab' | 'same-tab',
                    },
                  })}
                  options={[
                    { value: 'new-tab', label: 'New tab' },
                    { value: 'same-tab', label: 'Same tab (replace)' },
                  ]}
                />
              </FieldGroup>

              {settings.pdfSettings?.autoOpen && settings.pdfSettings.autoOpen !== 'off' && (
                <FieldGroup
                  label="Never auto-open these sites"
                  description="Comma-separated hostnames. Auto-open is suppressed for these even when enabled above."
                  htmlFor="pdf-never-open-input"
                >
                  <Input
                    id="pdf-never-open-input"
                    type="text"
                    placeholder="example.com, arxiv.org"
                    value={(settings.pdfSettings?.neverAutoOpenSites ?? []).join(', ')}
                    onChange={(e) => updateSettings({
                      pdfSettings: {
                        ...(settings.pdfSettings ?? { autoOpen: 'off', openMode: 'new-tab', neverAutoOpenSites: [] }),
                        neverAutoOpenSites: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      },
                    })}
                  />
                </FieldGroup>
              )}
            </div>
          </Card>
        </div>

        {/* Data & Developer Tools */}
        <div className="animate-stagger" style={stagger(3)}>
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
        <div className="animate-stagger" style={stagger(4)}>
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
