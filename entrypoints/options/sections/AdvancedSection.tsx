/**
 * Advanced Settings Section — cache, export/import, debug mode, and context features.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Download, Upload, Trash2, HardDrive, Wrench, Database, BrainCircuit, FileText, Braces, Bug, AlertTriangle, RotateCcw, Sparkles } from 'lucide-react';
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
import { Badge } from '@/ui/Badge';
import { Textarea } from '@/ui/Textarea';
import { DisabledDimmer } from '@/ui/DisabledDimmer';
import { AdvancedDisclosure } from '@/ui/AdvancedDisclosure';
import { useToast } from '@/ui/ToastProvider';
import { useDeferredCommit } from '@/entrypoints/options/hooks/useDeferredCommit';
import { useCacheStats } from '@/entrypoints/options/hooks/useCacheStats';
import {
  DEFAULT_SYSTEM_PROMPT_TEMPLATE,
  validatePromptTemplate,
} from '@/services/base';

/**
 * FR-11 — portable-settings allowlist. Only these keys are written to the
 * export file. Derived (not hand-listed inline) so the payload can't silently
 * drift from the settings shape; keep this list equal to the keys exported
 * historically to preserve byte-identical JSON for existing keys (NFR-1).
 */
const PORTABLE_KEYS = [
  'provider', 'sourceLanguage', 'targetLanguage', 'displayMode', 'theme',
  'translationPosition', 'darkMode', 'siteRules', 'glossary', 'subtitleSettings',
  'customSystemPrompt', 'maxBatchChars', 'cacheTTLDays', 'maxCacheSizeMB',
  'debugMode', 'customTheme', 'enableContextAwareTranslation',
  'enableLLMPageCategoryDetection', 'llmCategoryDetectionMode',
  'textSelectionEnabled', 'hoverTranslateEnabled', 'hoverDelay',
  'inlineTranslate', 'enableSmartExcludes', 'maxRpm',
  'enableCompactInlineForShortText',
] as const;

export function AdvancedSection() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);
  const [clearStatus, setClearStatus] = useState<'idle' | 'clearing' | 'done'>('idle');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showClearCacheModal, setShowClearCacheModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { success: showSuccess, error: showError } = useToast();
  const cacheStats = useCacheStats();

  // Cache configuration — commit-on-blur via useDeferredCommit (FR-9).
  // onCommit is just the store write; range validation + error state live in
  // the blur wrappers below. Per-field success toasts are dropped (the sidebar
  // "Auto-saved" badge already confirms every store write), matching the
  // providers-ux-refactor deferred-commit pattern.
  const ttlField = useDeferredCommit(settings.cacheTTLDays, (v) => updateSettings({ cacheTTLDays: v }));
  const maxCacheField = useDeferredCommit(settings.maxCacheSizeMB, (v) => updateSettings({ maxCacheSizeMB: v }));
  const maxBatchField = useDeferredCommit(settings.maxBatchChars, (v) => updateSettings({ maxBatchChars: v }));
  const maxRpmField = useDeferredCommit(settings.maxRpm ?? 0, (v) => updateSettings({ maxRpm: v }));
  // FR-2: request-boundary budget fields.
  const maxGroupField = useDeferredCommit(settings.maxTextGroupLengthPerRequest, (v) => updateSettings({ maxTextGroupLengthPerRequest: v }));
  const maxLengthField = useDeferredCommit(settings.maxTextLengthPerRequest, (v) => updateSettings({ maxTextLengthPerRequest: v }));
  // FR-4: negative-cache TTL field.
  const failureTtlField = useDeferredCommit(settings.failureCacheTtlMinutes, (v) => updateSettings({ failureCacheTtlMinutes: v }));
  const [cacheTTLError, setCacheTTLError] = useState('');
  const [maxCacheSizeError, setMaxCacheSizeError] = useState('');
  const [maxBatchCharsError, setMaxBatchCharsError] = useState('');
  const [maxRpmError, setMaxRpmError] = useState('');

  // FR-9: Global System Prompt editor relocated here from the Providers tab
  // (it's unrelated to any provider). Local draft synced to the upstream
  // setting when reset to null externally (Reset button / settings import).
  const [draftPrompt, setDraftPrompt] = useState(
    settings.customSystemPrompt ?? DEFAULT_SYSTEM_PROMPT_TEMPLATE,
  );
  useEffect(() => {
    if (settings.customSystemPrompt === null) {
      setDraftPrompt(DEFAULT_SYSTEM_PROMPT_TEMPLATE);
    }
  }, [settings.customSystemPrompt]);
  const promptValidation = settings.customSystemPrompt
    ? validatePromptTemplate(settings.customSystemPrompt)
    : null;

  /** FR-5 — insert a template variable at the cursor (or append) and commit. */
  const insertVariable = (variable: string) => {
    const el = document.getElementById('advanced-system-prompt') as HTMLTextAreaElement | null;
    const text = draftPrompt;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next =
      el && typeof el.setRangeText === 'function'
        ? text.slice(0, start) + variable + text.slice(end)
        : text + variable;
    if (el && typeof el.setRangeText === 'function') {
      el.setRangeText(variable, start, end, 'end');
    }
    setDraftPrompt(next);
    updateSettings({ customSystemPrompt: next });
  };

  const handleExportSettings = useCallback(() => {
    const exportData = Object.fromEntries(
      PORTABLE_KEYS.map((k) => [k, settings[k]]),
    );

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anyllm-translate-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    // P2 security: warn the user that the export contains their API key in
    // cleartext (the provider object is decrypted at load) so they treat the
    // file as a secret.
    if (settings.provider?.apiKey) {
      showError('Exported file contains your API key in cleartext — keep it private!');
    } else {
      showSuccess('Settings exported successfully');
    }
  }, [settings, showSuccess, showError]);

  const handleImportSettings = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      // P2 security: guard against prototype pollution. JSON.parse alone does NOT
      // set __proto__ on a plain object literal, but a crafted payload with a
      // "__proto__"/"constructor"/"prototype" key survives the spread below and
      // can pollute Object.prototype. Strip them (silently) before merging.
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Settings file must be a JSON object');
      }
      const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
      const knownKeys = new Set(Object.keys(DEFAULT_SETTINGS));
      const recognized: Record<string, unknown> = {};
      const ignored: string[] = [];
      for (const [key, value] of Object.entries(parsed)) {
        if (FORBIDDEN_KEYS.has(key)) continue;
        if (knownKeys.has(key)) {
          recognized[key] = value;
        } else {
          ignored.push(key);
        }
      }
      const merged = { ...DEFAULT_SETTINGS, ...recognized };
      await updateSettings(merged);
      // FR-11: surface unknown keys so users notice a partial/partially-stale import.
      if (ignored.length > 0) {
        showSuccess(
          `Imported ${Object.keys(recognized).length} settings; ignored ${ignored.length} unknown key(s): ${ignored.join(', ')}`,
        );
      } else {
        showSuccess('Settings imported successfully!');
      }
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
        void cacheStats.refresh();
      } else {
        throw new Error('Clear cache failed');
      }
      setTimeout(() => setClearStatus('idle'), 2000);
    } catch {
      setClearStatus('idle');
      showError('Failed to clear cache');
    }
  }, [showSuccess, showError, cacheStats.refresh]);

  const handleReset = useCallback(() => {
    resetToDefaults();
    setShowResetModal(false);
    showSuccess('All settings reset to defaults');
  }, [resetToDefaults, showSuccess]);

  // Cache configuration blur handlers — validate, set/clear error, then commit
  // (useDeferredCommit handles the dirty-check + external sync on reset/import).
  const handleCacheTTLBlur = () => {
    const value = Number(ttlField.value);
    if (value < 1 || value > 365) {
      setCacheTTLError('Must be between 1 and 365 days');
      return;
    }
    setCacheTTLError('');
    ttlField.commit();
  };

  const handleMaxCacheSizeBlur = () => {
    const value = Number(maxCacheField.value);
    if (value < 10 || value > 1000) {
      setMaxCacheSizeError('Must be between 10 and 1000 MB');
      return;
    }
    setMaxCacheSizeError('');
    maxCacheField.commit();
  };

  const handleMaxBatchCharsBlur = () => {
    const value = Number(maxBatchField.value);
    if (value < 500 || value > 10000) {
      setMaxBatchCharsError('Must be between 500 and 10000 characters');
      return;
    }
    setMaxBatchCharsError('');
    maxBatchField.commit();
  };

  const handleMaxRpmBlur = () => {
    const value = Number(maxRpmField.value);
    if (!Number.isInteger(value) || value < 0 || value > 600) {
      setMaxRpmError('Must be an integer between 0 and 600 (0 = unlimited)');
      return;
    }
    setMaxRpmError('');
    maxRpmField.commit();
  };

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Advanced"
        description="Performance tuning, data portability, and intelligence settings."
        icon={<Wrench className="w-4 h-4" />}
        accentColor="zinc"
      />

      {/* Hero status strip (FR-3): live cache usage + state chips at a glance */}
      <div className="mb-4 rounded-xl border border-zinc-500/20 bg-zinc-600/[0.04] p-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <div className="flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-500">Cache:</span>
            <span className="text-zinc-200 font-medium tabular-nums">
              {cacheStats.loading
                ? '…'
                : `${cacheStats.entryCount} entries · ${cacheStats.sizeMb.toFixed(1)} MB`}
            </span>
          </div>
          {settings.customSystemPrompt !== null && (
            <span className="inline-flex items-center gap-1 text-zinc-300">
              <Braces className="w-3.5 h-3.5 text-zinc-400" />
              Custom prompt
            </span>
          )}
          {settings.debugMode && (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <Bug className="w-3.5 h-3.5" />
              Debug on
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Translation System Prompt (relocated from Providers; elevated above tuning) */}
        <div className="animate-stagger" style={stagger(0)}>
          <Card variant="bordered">
            <div className="flex items-center gap-2 mb-4">
              <Braces className="w-3.5 h-3.5 text-zinc-500" />
              <h3 className="text-sm font-semibold text-zinc-200">Translation System Prompt</h3>
              {settings.customSystemPrompt !== null && (
                <Badge variant="info">Customized</Badge>
              )}
            </div>
            <FieldGroup
              label="Custom prompt template"
              description="Customize translation instructions. Use {{targetLanguage}} and {{glossary}} variables."
              htmlFor="advanced-system-prompt"
            >
              <Textarea
                id="advanced-system-prompt"
                value={draftPrompt}
                onChange={(e) => {
                  const val = e.target.value;
                  setDraftPrompt(val);
                  updateSettings({ customSystemPrompt: val });
                }}
                rows={8}
                mono
              />
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-xs text-zinc-500">Insert variable:</span>
                <button
                  type="button"
                  onClick={() => insertVariable('{{targetLanguage}}')}
                  className="inline-flex items-center rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[11px] font-mono text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 transition-colors cursor-pointer"
                >
                  {'{{targetLanguage}}'}
                </button>
                <button
                  type="button"
                  onClick={() => insertVariable('{{glossary}}')}
                  className="inline-flex items-center rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[11px] font-mono text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 transition-colors cursor-pointer"
                >
                  {'{{glossary}}'}
                </button>
              </div>
              <div className="flex items-start justify-between gap-3 mt-2">
                <ul className="space-y-1">
                  {promptValidation &&
                    !promptValidation.valid &&
                    promptValidation.warnings.map((w) => (
                      <li key={w} className="flex items-start gap-1 text-amber-400 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>{w}</span>
                      </li>
                    ))}
                </ul>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw className="w-3 h-3" />}
                  onClick={() => updateSettings({ customSystemPrompt: null })}
                >
                  Reset to Default
                </Button>
              </div>
            </FieldGroup>
          </Card>
        </div>

        {/* Performance & Throughput (cache + rate limiting merged) */}
        <div className="animate-stagger" style={stagger(1)}>
          <Card title="Performance & Throughput" icon={<HardDrive className="w-3.5 h-3.5" />} variant="bordered">
            <div className="space-y-5">
              <FieldGroup
                label="Cache TTL (days)"
                description="How long translations are cached before expiration."
                htmlFor="cache-ttl-input"
              >
                <Input
                  id="cache-ttl-input"
                  type="number"
                  value={ttlField.value}
                  onChange={(e) => ttlField.setValue(Number(e.target.value))}
                  onBlur={handleCacheTTLBlur}
                  min={1}
                  max={365}
                  error={cacheTTLError}
                  hint="1–365 days"
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
                  value={maxCacheField.value}
                  onChange={(e) => maxCacheField.setValue(Number(e.target.value))}
                  onBlur={handleMaxCacheSizeBlur}
                  min={10}
                  max={1000}
                  error={maxCacheSizeError}
                  hint="10–1000 MB"
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
                  value={maxBatchField.value}
                  onChange={(e) => maxBatchField.setValue(Number(e.target.value))}
                  onBlur={handleMaxBatchCharsBlur}
                  min={500}
                  max={10000}
                  error={maxBatchCharsError}
                  hint="500–10000 chars"
                />
              </FieldGroup>
              <div className="border-t border-zinc-800 pt-5">
                <FieldGroup
                  label="Max requests per minute"
                  description="Limit provider calls per minute to avoid hitting rate limits (0 = unlimited). Leave at 0 for local LLMs like Ollama/LM Studio."
                  htmlFor="max-rpm-input"
                >
                  <Input
                    id="max-rpm-input"
                    type="number"
                    value={maxRpmField.value}
                    onChange={(e) => maxRpmField.setValue(Number(e.target.value))}
                    onBlur={handleMaxRpmBlur}
                    min={0}
                    max={600}
                    error={maxRpmError}
                    hint="0–600 rpm"
                  />
                  {maxRpmField.value === 0 && !maxRpmError && (
                    <Badge variant="info" className="mt-1">Unlimited</Badge>
                  )}
                </FieldGroup>
              </div>
            </div>
          </Card>
        </div>

        {/* Translation Quality (FR-1/2/3/4/6/7 toggles + request budgets) */}
        <div className="animate-stagger" style={stagger(2)}>
          <Card title="Translation Quality" icon={<Sparkles className="w-3.5 h-3.5" />} variant="bordered">
            <div className="space-y-4">
              <Toggle
                id="rich-translate-toggle"
                checked={settings.enableRichTranslate}
                onChange={(checked) => updateSettings({ enableRichTranslate: checked })}
                label="Rich Translate (inline markup)"
                description="Preserve bold, links, code, and other inline formatting in translated paragraphs."
              />
              <Toggle
                id="source-lang-detect-toggle"
                checked={settings.enableSourceLanguageDetection}
                onChange={(checked) => updateSettings({ enableSourceLanguageDetection: checked })}
                label="Source-Language Detection"
                description="Skip translation for text already in the target language (saves tokens + latency)."
              />
              <Toggle
                id="failure-cache-toggle"
                checked={settings.enableFailureCache}
                onChange={(checked) => updateSettings({ enableFailureCache: checked })}
                label="Failure Cache"
                description="Temporarily remember translation failures so flaky providers aren't retried every scroll-past."
              />
              <Toggle
                id="web-resume-toggle"
                checked={settings.enableWebResume}
                onChange={(checked) => updateSettings({ enableWebResume: checked })}
                label="Cross-Session Resume"
                description="Restore translated state after a page refresh (when the cache still holds translations)."
              />
              <Toggle
                id="streaming-toggle"
                checked={settings.enableStreamingTranslation}
                onChange={(checked) => updateSettings({ enableStreamingTranslation: checked })}
                label="Streaming Translation (experimental)"
                description="Fill translations incrementally as the response streams, instead of waiting for the full batch."
              />

              <AdvancedDisclosure label="Request budget & failure TTL">
                <div className="space-y-5">
                  <FieldGroup
                    label="Max pieces per request"
                    description="How many paragraphs are grouped into a single LLM call (0 = unlimited)."
                    htmlFor="max-text-group-input"
                  >
                    <Input
                      id="max-text-group-input"
                      type="number"
                      value={maxGroupField.value}
                      onChange={(e) => maxGroupField.setValue(Number(e.target.value))}
                      onBlur={maxGroupField.commit}
                      min={0}
                      max={50}
                      hint="0–50 (default 4)"
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Max characters per request"
                    description="Maximum total characters sent in one LLM request (0 = unlimited)."
                    htmlFor="max-text-length-input"
                  >
                    <Input
                      id="max-text-length-input"
                      type="number"
                      value={maxLengthField.value}
                      onChange={(e) => maxLengthField.setValue(Number(e.target.value))}
                      onBlur={maxLengthField.commit}
                      min={0}
                      max={20000}
                      hint="0–20000 (default 2000)"
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Failure cache TTL (minutes)"
                    description="How long a failed translation is remembered before retrying."
                    htmlFor="failure-ttl-input"
                  >
                    <Input
                      id="failure-ttl-input"
                      type="number"
                      value={failureTtlField.value}
                      onChange={(e) => failureTtlField.setValue(Number(e.target.value))}
                      onBlur={failureTtlField.commit}
                      min={1}
                      max={1440}
                      hint="1–1440 minutes (default 120)"
                    />
                  </FieldGroup>
                </div>
              </AdvancedDisclosure>
            </div>
          </Card>
        </div>

        {/* Context & Intelligence */}
        <div className="animate-stagger" style={stagger(3)}>
          <Card title="Context & Intelligence" icon={<BrainCircuit className="w-3.5 h-3.5" />} variant="bordered">
            <div className="space-y-4">
              <Toggle
                id="context-aware-toggle"
                checked={settings.enableContextAwareTranslation}
                onChange={(checked) => updateSettings({ enableContextAwareTranslation: checked })}
                label="Context-Aware Translation"
                description="Inject page title, description, and domain into translation prompts for more consistent terminology."
              />
              
              <DisabledDimmer
                disabled={!settings.enableContextAwareTranslation}
                className="pt-4 border-t border-zinc-800 space-y-4"
              >
                <Toggle
                  id="page-category-detection-toggle"
                  checked={settings.enableLLMPageCategoryDetection}
                  onChange={(checked) => updateSettings({ enableLLMPageCategoryDetection: checked })}
                  disabled={!settings.enableContextAwareTranslation}
                  label="LLM-based Page Category Detection"
                  description="Auto-detect page topic using LLM for better terminology. Requires background API call."
                />
                
                {settings.enableLLMPageCategoryDetection && (
                  <AdvancedDisclosure label="Detection mode">
                    <FieldGroup label="Detection Mode" htmlFor="llm-category-mode-select">
                      <Select
                        id="llm-category-mode-select"
                        value={settings.llmCategoryDetectionMode}
                        onChange={(e) => updateSettings({ llmCategoryDetectionMode: e.target.value as 'async' | 'blocking' })}
                        disabled={!settings.enableContextAwareTranslation}
                        options={[
                          { value: 'async', label: 'Async (No delay, progressive context upgrade)' },
                          { value: 'blocking', label: 'Blocking (Wait for exact context before first translation)' },
                        ]}
                      />
                    </FieldGroup>
                  </AdvancedDisclosure>
                )}
              </DisabledDimmer>
            </div>
          </Card>
        </div>

        {/* PDF Translator */}
        <div className="animate-stagger" style={stagger(4)}>
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
                <div className="animate-fade-in-up" aria-live="polite">
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
                    {(settings.pdfSettings?.neverAutoOpenSites ?? []).length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className="text-xs text-zinc-500">Will skip:</span>
                        {(settings.pdfSettings?.neverAutoOpenSites ?? []).map((host) => (
                          <span
                            key={host}
                            className="inline-flex items-center rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400"
                          >
                            {host}
                          </span>
                        ))}
                      </div>
                    )}
                  </FieldGroup>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Data Portability */}
        <div className="animate-stagger" style={stagger(5)}>
          <Card title="Data Portability" icon={<Database className="w-3.5 h-3.5" />} variant="bordered">
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
            {settings.provider?.apiKey && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-400 text-xs mt-3">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Your export will include the provider API key in cleartext.
                  Treat the file as a secret and don't share it.
                </span>
              </div>
            )}
          </Card>
        </div>

        {/* Developer */}
        <div className="animate-stagger" style={stagger(6)}>
          <Card title="Developer" icon={<Wrench className="w-3.5 h-3.5" />} variant="bordered">
            <Toggle
              id="debug-mode-toggle"
              checked={settings.debugMode}
              onChange={(checked) => updateSettings({ debugMode: checked })}
              label="Debug Mode"
              description="Enable verbose logging in the browser console."
            />
          </Card>
        </div>

        {/* Danger Zone */}
        <div className="animate-stagger" style={stagger(7)}>
          <Card title="Danger Zone" icon={<AlertTriangle className="w-3.5 h-3.5" />} accent="red" variant="bordered">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-zinc-200">Clear translation cache</p>
                <p className="text-xs text-zinc-500 mt-0.5">Deletes all cached translations. Future translations re-fetch from your provider (may incur API costs).</p>
                <div className="mt-3">
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
                </div>
              </div>
              <div className="border-t border-zinc-800 pt-4">
                <p className="text-sm font-medium text-zinc-200">Reset all settings</p>
                <p className="text-xs text-zinc-500 mt-0.5">Restores all settings to defaults — custom dictionary, site rules, and provider configuration will be lost. Cannot be undone.</p>
                <div className="mt-3">
                  <Button
                    id="reset-all-settings-btn"
                    variant="danger"
                    onClick={() => setShowResetModal(true)}
                    icon={<RotateCcw className="w-4 h-4" />}
                  >
                    Reset All
                  </Button>
                </div>
              </div>
            </div>
          </Card>
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
