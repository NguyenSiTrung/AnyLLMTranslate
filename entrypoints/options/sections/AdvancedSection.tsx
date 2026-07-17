/**
 * Advanced Settings Section — cache, export/import, debug mode, and context features.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Download,
  Upload,
  Trash2,
  HardDrive,
  Wrench,
  Database,
  BrainCircuit,
  FileText,
  Braces,
  Bug,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ShieldAlert,
  Gauge,
  Zap,
  CheckCircle2,
  FlaskConical,
} from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import { DEFAULT_SETTINGS, DEFAULT_SCIENTIFIC_PDF_SETTINGS } from '@/types/config';
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
import { DangerZone, DangerAction } from '@/ui/DangerZone';
import { SettingsGroup } from '@/ui/SettingsGroup';
import { useToast } from '@/ui/ToastProvider';
import { useDeferredCommit } from '@/entrypoints/options/hooks/useDeferredCommit';
import { useCacheStats } from '@/entrypoints/options/hooks/useCacheStats';
import {
  DEFAULT_SYSTEM_PROMPT_TEMPLATE,
  validatePromptTemplate,
} from '@/services/base';
import {
  applyPageScopePreset,
  detectPageScopePreset,
  PAGE_SCOPE_PRESET_OPTIONS,
  type PageScopePreset,
} from '@/lib/pageScopePreset';
import {
  mergeScientificPdfSettings,
  resolveScientificPdfStatus,
  shouldWarnNonLoopbackServerUrl,
  type ScientificPdfStatus,
} from '@/lib/scientificPdf';
import { ScientificPdfWizard } from '@/entrypoints/options/components/ScientificPdfWizard';

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
  'textSelectionEnabled', 'selectionDictionaryEnabled', 'hoverTranslateEnabled', 'hoverDelay',
  'inlineTranslate', 'enableSmartExcludes', 'maxRpm',
  'enableCompactInlineForShortText',
] as const;

function scientificStatusBadge(status: ScientificPdfStatus): {
  variant: 'info' | 'success' | 'warning' | 'danger';
  label: string;
} {
  switch (status) {
    case 'ready':
      return { variant: 'success', label: 'Ready' };
    case 'offline':
      return { variant: 'warning', label: 'Offline' };
    default:
      return { variant: 'info', label: 'Not installed' };
  }
}

export function AdvancedSection() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);
  const [clearStatus, setClearStatus] = useState<'idle' | 'clearing' | 'done'>('idle');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showClearCacheModal, setShowClearCacheModal] = useState(false);
  const [showScientificWizard, setShowScientificWizard] = useState(false);
  const [scientificHealthOk, setScientificHealthOk] = useState<boolean | null>(null);
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

  const cacheLimitMb = Number(maxCacheField.value) || settings.maxCacheSizeMB || 1;
  const cacheUsagePct = cacheStats.loading
    ? 0
    : Math.min(100, Math.round((cacheStats.sizeMb / cacheLimitMb) * 100));
  const cacheBarTone =
    cacheUsagePct >= 90 ? 'bg-rose-500' : cacheUsagePct >= 70 ? 'bg-amber-500' : 'bg-cyan-500';
  const pdfAutoOpen = settings.pdfSettings?.autoOpen ?? 'off';
  const pdfOpenMode = settings.pdfSettings?.openMode ?? 'new-tab';
  const neverAutoOpenSites = settings.pdfSettings?.neverAutoOpenSites ?? [];
  const translateTableText = settings.pdfSettings?.translateTableText ?? false;
  const strictMathSkip = settings.pdfSettings?.strictMathSkip ?? false;
  const autoExtractTerms = settings.pdfSettings?.autoExtractTerms ?? true;
  const detectScanned = settings.pdfSettings?.detectScanned ?? true;
  const autoOcrWorkaround = settings.pdfSettings?.autoOcrWorkaround ?? true;
  const scientificPdf = mergeScientificPdfSettings(settings.scientificPdf);
  const scientificStatus = resolveScientificPdfStatus({
    settings: scientificPdf,
    healthOk: scientificHealthOk,
  });
  const scientificBadge = scientificStatusBadge(scientificStatus);
  const scientificNonLoopback = shouldWarnNonLoopbackServerUrl(scientificPdf.serverUrl);
  const defaultPdfSettings = {
    autoOpen: 'off' as const,
    openMode: 'new-tab' as const,
    neverAutoOpenSites: [] as string[],
    translateTableText: false,
    strictMathSkip: false,
    autoExtractTerms: true,
    detectScanned: true,
    autoOcrWorkaround: true,
  };

  const refreshScientificHealth = useCallback(async () => {
    try {
      const res = (await chrome.runtime.sendMessage({
        action: 'SCIENTIFIC_PDF_HEALTH',
      })) as { success?: boolean; status?: string };
      setScientificHealthOk(Boolean(res?.success && res.status === 'ok'));
    } catch {
      setScientificHealthOk(false);
    }
  }, []);

  useEffect(() => {
    if (!scientificPdf.enabled && !scientificPdf.setupCompletedAt) {
      setScientificHealthOk(null);
      return;
    }
    void refreshScientificHealth();
  }, [scientificPdf.enabled, scientificPdf.setupCompletedAt, scientificPdf.serverUrl, refreshScientificHealth]);
  const isPromptCustom = settings.customSystemPrompt !== null;
  const promptWarnings =
    promptValidation && !promptValidation.valid ? promptValidation.warnings : [];

  const overviewChips = [
    {
      key: 'prompt',
      active: isPromptCustom,
      icon: <Braces className="h-3 w-3" />,
      label: isPromptCustom ? 'Custom prompt' : 'Default prompt',
      activeClass: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    },
    {
      key: 'context',
      active: settings.enableContextAwareTranslation,
      icon: <BrainCircuit className="h-3 w-3" />,
      label: 'Context',
      activeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    },
    {
      key: 'stream',
      active: settings.enableStreamingTranslation,
      icon: <Zap className="h-3 w-3" />,
      label: 'Streaming',
      activeClass: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    },
    {
      key: 'debug',
      active: settings.debugMode,
      icon: <Bug className="h-3 w-3" />,
      label: 'Debug',
      activeClass: 'border-amber-500/35 bg-amber-500/15 text-amber-300',
    },
  ] as const;

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Advanced"
        description="Performance tuning, intelligence, data portability, and developer tools."
        icon={<Wrench className="w-4 h-4" />}
        accentColor="zinc"
      />

      {/* Overview strip — live cache + feature chips at a glance */}
      <div className="mb-5 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] via-zinc-950/40 to-zinc-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="grid gap-0 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="border-b border-white/5 p-4 sm:border-b-0 sm:border-r">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <HardDrive className="h-3.5 w-3.5 text-cyan-500/80" aria-hidden="true" />
                Translation cache
              </div>
              <span className="text-[11px] tabular-nums text-zinc-400">
                {cacheStats.loading ? '…' : `${cacheUsagePct}% of ${cacheLimitMb} MB`}
              </span>
            </div>
            <p className="text-sm font-semibold tabular-nums text-zinc-100">
              {cacheStats.loading
                ? 'Measuring…'
                : `${cacheStats.entryCount.toLocaleString()} entries · ${cacheStats.sizeLabel}`}
            </p>
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800"
              role="progressbar"
              aria-valuenow={cacheUsagePct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Cache usage"
            >
              <div
                className={`h-full rounded-full transition-all duration-500 ${cacheBarTone}`}
                style={{ width: `${cacheStats.loading ? 8 : Math.max(cacheUsagePct, cacheStats.entryCount > 0 ? 4 : 0)}%` }}
              />
            </div>
          </div>

          <div className="p-4">
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Active features
            </p>
            <div className="flex flex-wrap gap-1.5">
              {overviewChips.map((chip) => (
                <span
                  key={chip.key}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    chip.active
                      ? chip.activeClass
                      : 'border-zinc-800 bg-zinc-900/50 text-zinc-600'
                  }`}
                >
                  {chip.icon}
                  {chip.label}
                </span>
              ))}
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  maxRpmField.value === 0
                    ? 'border-zinc-800 bg-zinc-900/50 text-zinc-600'
                    : 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                }`}
              >
                <Gauge className="h-3 w-3" aria-hidden="true" />
                {maxRpmField.value === 0 ? 'RPM unlimited' : `${maxRpmField.value} RPM`}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  pdfAutoOpen === 'off'
                    ? 'border-zinc-800 bg-zinc-900/50 text-zinc-600'
                    : 'border-orange-500/30 bg-orange-500/10 text-orange-300'
                }`}
              >
                <FileText className="h-3 w-3" aria-hidden="true" />
                PDF {pdfAutoOpen}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Translation System Prompt */}
        <div className="animate-stagger" style={stagger(0)}>
          <Card
            variant="bordered"
            accent="cyan"
            title="Translation System Prompt"
            description="Instructions sent with every translation. Use template variables so language and glossary stay dynamic."
            icon={<Braces className="w-3.5 h-3.5" />}
            headerExtra={
              isPromptCustom ? (
                <Badge variant="info">Customized</Badge>
              ) : (
                <Badge variant="success">Default</Badge>
              )
            }
          >
            <div className="overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950/50">
              <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/90 bg-zinc-900/40 px-3 py-2">
                <span className="text-[11px] font-medium text-zinc-500">Insert</span>
                {(
                  [
                    { token: '{{targetLanguage}}', tip: 'Target language name' },
                    { token: '{{glossary}}', tip: 'Active glossary terms' },
                  ] as const
                ).map(({ token, tip }) => (
                  <button
                    key={token}
                    type="button"
                    title={tip}
                    onClick={() => insertVariable(token)}
                    className="inline-flex items-center rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] text-cyan-200/90 transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/20 hover:text-cyan-100 cursor-pointer"
                  >
                    {token}
                  </button>
                ))}
                <span className="ml-auto hidden text-[11px] text-zinc-600 sm:inline">
                  Click to insert at cursor
                </span>
              </div>
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
                flush
                aria-label="Custom prompt template"
              />
            </div>

            {promptWarnings.length > 0 && (
              <ul className="mt-3 space-y-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
                {promptWarnings.map((w) => (
                  <li key={w} className="flex items-start gap-2 text-xs text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-zinc-600">
                Changes save automatically. Reset restores the built-in template.
              </p>
              <Button
                variant="ghost"
                size="sm"
                icon={<RotateCcw className="w-3 h-3" />}
                onClick={() => updateSettings({ customSystemPrompt: null })}
                disabled={!isPromptCustom}
              >
                Reset to default
              </Button>
            </div>
          </Card>
        </div>

        {/* Performance & Throughput */}
        <div className="animate-stagger" style={stagger(1)}>
          <Card
            variant="bordered"
            accent="blue"
            title="Performance & Throughput"
            description="Cache lifetime, storage ceiling, batch size, and provider rate limits."
            icon={<HardDrive className="w-3.5 h-3.5" />}
            headerExtra={
              !cacheStats.loading ? (
                <span className="text-[11px] tabular-nums text-zinc-500">
                  {cacheStats.entryCount.toLocaleString()} cached
                </span>
              ) : null
            }
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <SettingsGroup title="Cache" description="How long and how much translation data is stored locally.">
                <FieldGroup
                  label="Cache TTL (days)"
                  description="How long translations stay cached before expiring."
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
                  label="Max cache size (MB)"
                  description="Hard ceiling for local cache storage."
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
                  {!cacheStats.loading && (
                    <div className="mt-2">
                      <div className="mb-1 flex justify-between text-[11px] text-zinc-500">
                        <span>Current use</span>
                        <span className="tabular-nums">
                          {cacheStats.sizeLabel} / {cacheLimitMb} MB
                        </span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${cacheBarTone}`}
                          style={{ width: `${Math.max(cacheUsagePct, cacheStats.entryCount > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </FieldGroup>
              </SettingsGroup>

              <SettingsGroup title="Throughput" description="Batch size and calls per minute to your provider.">
                <FieldGroup
                  label="Max batch characters"
                  description="Maximum characters grouped into one translation request."
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
                <FieldGroup
                  label="Max requests per minute"
                  description="Cap provider calls to avoid rate limits. Enter a number of requests per minute (req/min). Use 0 for unlimited (local LLMs)."
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
                    suffix="req/min"
                    placeholder="20"
                    hint="Unit: requests per minute · 0 = unlimited · range 0–600"
                  />
                  {maxRpmField.value === 0 && !maxRpmError && (
                    <div className="mt-2">
                      <Badge variant="info">Unlimited · good for Ollama / LM Studio</Badge>
                    </div>
                  )}
                </FieldGroup>
              </SettingsGroup>
            </div>
          </Card>
        </div>

        {/* Translation Quality */}
        <div className="animate-stagger" style={stagger(2)}>
          <Card
            variant="bordered"
            title="Translation Quality"
            description="How text is selected, formatted, skipped, and recovered on the page."
            icon={<Sparkles className="w-3.5 h-3.5" />}
          >
            <div className="space-y-6">
              <SettingsGroup title="Selection & formatting" description="Richer output for short and structured text.">
                <Toggle
                  id="selection-dictionary-toggle"
                  checked={settings.selectionDictionaryEnabled}
                  onChange={(checked) => updateSettings({ selectionDictionaryEnabled: checked })}
                  label="Dictionary mode for selection"
                  description="Short selections get phonetics, definitions, and examples. Longer sentences stay translation-only."
                />
                <Toggle
                  id="rich-translate-toggle"
                  checked={settings.enableRichTranslate}
                  onChange={(checked) => updateSettings({ enableRichTranslate: checked })}
                  label="Rich translate (inline markup)"
                  description="Preserve bold, links, code, and other inline formatting in translated paragraphs."
                />
              </SettingsGroup>

              <div className="border-t border-zinc-800/80 pt-5">
                <SettingsGroup title="Efficiency & reliability" description="Spend fewer tokens and recover faster from flaky providers.">
                  <Toggle
                    id="source-lang-detect-toggle"
                    checked={settings.enableSourceLanguageDetection}
                    onChange={(checked) => updateSettings({ enableSourceLanguageDetection: checked })}
                    label="Source-language detection"
                    description="Skip text already in the target language — saves tokens and latency."
                  />
                  <Toggle
                    id="failure-cache-toggle"
                    checked={settings.enableFailureCache}
                    onChange={(checked) => updateSettings({ enableFailureCache: checked })}
                    label="Failure cache"
                    description="Remember recent failures so flaky providers aren't retried on every scroll."
                  />
                  <Toggle
                    id="web-resume-toggle"
                    checked={settings.enableWebResume}
                    onChange={(checked) => updateSettings({ enableWebResume: checked })}
                    label="Cross-session resume"
                    description="Restore translated state after refresh when the cache still holds results."
                  />
                </SettingsGroup>
              </div>

              <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.04] px-4 py-3.5">
                <Toggle
                  id="streaming-toggle"
                  checked={settings.enableStreamingTranslation}
                  onChange={(checked) => updateSettings({ enableStreamingTranslation: checked })}
                  label="Streaming translation"
                  labelExtra={<Badge variant="info">Default on</Badge>}
                  description="Fill translations as the response streams instead of waiting for the full batch. Falls back to non-streaming if the stream fails. Turn off via Classic page-scope preset."
                />
              </div>

              <AdvancedDisclosure label="Request budget & failure TTL" idPrefix="quality-budgets">
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <FieldGroup
                    label="Max pieces per request"
                    description="Paragraphs grouped into one LLM call (0 = unlimited)."
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
                      hint="0–50 · default 4"
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Max characters per request"
                    description="Total characters in one LLM request (0 = unlimited)."
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
                      hint="0–20000 · default 2000"
                    />
                  </FieldGroup>
                  <FieldGroup
                    label="Failure cache TTL (minutes)"
                    description="How long failures are remembered before retry."
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
                      hint="1–1440 · default 120"
                    />
                  </FieldGroup>
                </div>
              </AdvancedDisclosure>

              <div className="border-t border-zinc-800/80 pt-5">
                <SettingsGroup
                  title="Page walk tuning"
                  description="What parts of the DOM are eligible for translation."
                >
                  <FieldGroup
                    label="Page scope preset"
                    description="Quick profiles for walk + streaming. Classic restores pre-v3 defaults."
                    htmlFor="page-scope-preset"
                  >
                    <Select
                      id="page-scope-preset"
                      value={(() => {
                        const detected = detectPageScopePreset({
                          enableStreamingTranslation: settings.enableStreamingTranslation,
                          enableAsideCaps: settings.enableAsideCaps,
                          enableBodyTagWhitelist: settings.enableBodyTagWhitelist,
                          enableSmartExcludes: settings.enableSmartExcludes,
                        });
                        return detected === 'custom' ? 'custom' : detected;
                      })()}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') return;
                        updateSettings(applyPageScopePreset(val as PageScopePreset));
                      }}
                      options={[
                        ...PAGE_SCOPE_PRESET_OPTIONS.map((o) => ({
                          value: o.value,
                          label: o.label,
                        })),
                        {
                          value: 'custom',
                          label: 'Custom (mixed)',
                        },
                      ]}
                    />
                  </FieldGroup>
                  <p className="text-[11px] text-zinc-500 -mt-2 mb-1 leading-relaxed">
                    {(() => {
                      const detected = detectPageScopePreset({
                        enableStreamingTranslation: settings.enableStreamingTranslation,
                        enableAsideCaps: settings.enableAsideCaps,
                        enableBodyTagWhitelist: settings.enableBodyTagWhitelist,
                        enableSmartExcludes: settings.enableSmartExcludes,
                      });
                      if (detected === 'custom') {
                        return 'Individual toggles below don’t match a named preset.';
                      }
                      return (
                        PAGE_SCOPE_PRESET_OPTIONS.find((o) => o.value === detected)?.description ??
                        ''
                      );
                    })()}
                  </p>
                  <Toggle
                    id="body-tag-whitelist-toggle"
                    checked={settings.enableBodyTagWhitelist}
                    onChange={(checked) => updateSettings({ enableBodyTagWhitelist: checked })}
                    label="Body-tag whitelist"
                    description="Only translate direct body children that are MAIN, ARTICLE, SECTION, or DIV — skips nav, aside, header, footer."
                  />
                  <Toggle
                    id="aside-caps-toggle"
                    checked={settings.enableAsideCaps}
                    onChange={(checked) => updateSettings({ enableAsideCaps: checked })}
                    label="Aside text caps"
                    description="Limit sidebar/aside work: skip long paragraphs and cap each region at 1000 characters. On by default (Balanced); Classic turns this off."
                  />
                  <Toggle
                    id="adaptive-batching-toggle"
                    checked={settings.enableAdaptiveBatching}
                    onChange={(checked) => updateSettings({ enableAdaptiveBatching: checked })}
                    label="Adaptive batch size"
                    description="Adjust pieces/characters per request from recent latency. Off by default — fixed budgets above still apply when disabled."
                  />
                  <Toggle
                    id="cache-key-model-toggle"
                    checked={settings.cacheKeyIncludesModel}
                    onChange={(checked) => updateSettings({ cacheKeyIncludesModel: checked })}
                    label="Model-scoped cache keys"
                    description="Include the active model in the cache key so switching models does not reuse prior translations. Off by default."
                  />
                  <Toggle
                    id="quality-check-toggle"
                    checked={settings.enableTranslationQualityCheck}
                    onChange={(checked) =>
                      updateSettings({ enableTranslationQualityCheck: checked })
                    }
                    label="Translation quality self-check"
                    description="After a batch, re-prompt once if the model echoes the source or drops rich-translate tags. Off by default."
                  />
                  <Toggle
                    id="layout-containment-toggle"
                    checked={settings.enableLayoutContainment}
                    onChange={(checked) => updateSettings({ enableLayoutContainment: checked })}
                    label="Layout containment"
                    description="Safer insertion for flex/grid cards (may slightly alter host layout). Off by default."
                  />
                  <Toggle
                    id="shadow-dom-walk-toggle"
                    checked={settings.enableShadowDomWalk}
                    onChange={(checked) => updateSettings({ enableShadowDomWalk: checked })}
                    label="Walk open Shadow DOM"
                    description="Extract text from open shadow roots (web components). Off by default."
                  />
                </SettingsGroup>
              </div>
            </div>
          </Card>
        </div>

        {/* Context & Intelligence */}
        <div className="animate-stagger" style={stagger(3)}>
          <Card
            variant="bordered"
            accent="emerald"
            title="Context & Intelligence"
            description="Give the model page context so terminology stays consistent across a site."
            icon={<BrainCircuit className="w-3.5 h-3.5" />}
            headerExtra={
              settings.enableContextAwareTranslation ? (
                <Badge variant="success">On</Badge>
              ) : (
                <Badge variant="info">Off</Badge>
              )
            }
          >
            <div className="space-y-4">
              <Toggle
                id="context-aware-toggle"
                checked={settings.enableContextAwareTranslation}
                onChange={(checked) => updateSettings({ enableContextAwareTranslation: checked })}
                label="Context-aware translation"
                description="Inject page title, description, and domain into prompts for more consistent wording."
              />

              <DisabledDimmer
                disabled={!settings.enableContextAwareTranslation}
                className="space-y-4 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] p-4"
              >
                <Toggle
                  id="page-category-detection-toggle"
                  checked={settings.enableLLMPageCategoryDetection}
                  onChange={(checked) => updateSettings({ enableLLMPageCategoryDetection: checked })}
                  disabled={!settings.enableContextAwareTranslation}
                  label="LLM page category detection"
                  description="Detect the page topic with a background LLM call for better terminology. Uses a small extra request."
                />

                {settings.enableLLMPageCategoryDetection && (
                  <div className="animate-fade-in-up border-t border-emerald-500/10 pt-4">
                    <FieldGroup
                      label="Detection mode"
                      description="Async upgrades context after the first paints; blocking waits for a category before translating."
                      htmlFor="llm-category-mode-select"
                    >
                      <Select
                        id="llm-category-mode-select"
                        value={settings.llmCategoryDetectionMode}
                        onChange={(e) =>
                          updateSettings({
                            llmCategoryDetectionMode: e.target.value as 'async' | 'blocking',
                          })
                        }
                        disabled={!settings.enableContextAwareTranslation}
                        options={[
                          { value: 'async', label: 'Async — no delay, progressive upgrade' },
                          { value: 'blocking', label: 'Blocking — wait before first translation' },
                        ]}
                      />
                    </FieldGroup>
                  </div>
                )}
              </DisabledDimmer>
            </div>
          </Card>
        </div>

        {/* PDF Translator */}
        <div className="animate-stagger" style={stagger(4)}>
          <Card
            variant="bordered"
            accent="amber"
            title="PDF Translator"
            description="Detect PDF tabs and open the built-in translator. Works with extensionless URLs like arXiv."
            icon={<FileText className="w-3.5 h-3.5" />}
            headerExtra={
              <Badge variant={pdfAutoOpen === 'off' ? 'info' : 'warning'}>
                {pdfAutoOpen === 'off' ? 'Manual' : pdfAutoOpen === 'prompt' ? 'Prompt' : 'Auto'}
              </Badge>
            }
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <FieldGroup
                label="Auto-open mode"
                description="When a PDF tab is detected, how aggressively to open the translator."
                htmlFor="pdf-auto-open-select"
              >
                <Select
                  id="pdf-auto-open-select"
                  value={pdfAutoOpen}
                  onChange={(e) =>
                    updateSettings({
                      pdfSettings: {
                        ...(settings.pdfSettings ?? defaultPdfSettings),
                        autoOpen: e.target.value as 'off' | 'prompt' | 'auto',
                      },
                    })
                  }
                  options={[
                    { value: 'off', label: 'Off — manual only' },
                    { value: 'prompt', label: 'Prompt — show banner button' },
                    { value: 'auto', label: 'Auto — open immediately' },
                  ]}
                />
              </FieldGroup>

              <FieldGroup
                label="Open mode"
                description="New tab keeps the native viewer; same tab replaces it."
                htmlFor="pdf-open-mode-select"
              >
                <Select
                  id="pdf-open-mode-select"
                  value={pdfOpenMode}
                  onChange={(e) =>
                    updateSettings({
                      pdfSettings: {
                        ...(settings.pdfSettings ?? defaultPdfSettings),
                        openMode: e.target.value as 'new-tab' | 'same-tab',
                      },
                    })
                  }
                  options={[
                    { value: 'new-tab', label: 'New tab' },
                    { value: 'same-tab', label: 'Same tab (replace)' },
                  ]}
                />
              </FieldGroup>
            </div>

            {pdfAutoOpen !== 'off' && (
              <div className="mt-5 animate-fade-in-up" aria-live="polite">
                <FieldGroup
                  label="Never auto-open these sites"
                  description="Comma-separated hostnames. Auto-open stays suppressed even when enabled above."
                  htmlFor="pdf-never-open-input"
                >
                  <Input
                    id="pdf-never-open-input"
                    type="text"
                    placeholder="example.com, arxiv.org"
                    value={neverAutoOpenSites.join(', ')}
                    onChange={(e) =>
                      updateSettings({
                        pdfSettings: {
                          ...(settings.pdfSettings ?? defaultPdfSettings),
                          neverAutoOpenSites: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                  />
                  {neverAutoOpenSites.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-zinc-500">Skipping:</span>
                      {neverAutoOpenSites.map((host) => (
                        <span
                          key={host}
                          className="inline-flex items-center rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-200/90"
                        >
                          {host}
                        </span>
                      ))}
                    </div>
                  )}
                </FieldGroup>
              </div>
            )}

            <div className="mt-6 border-t border-zinc-800/80 pt-5">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Power-user composition
              </p>
              <div className="grid gap-4">
                <Toggle
                  checked={translateTableText}
                  onChange={(checked) =>
                    updateSettings({
                      pdfSettings: {
                        ...(settings.pdfSettings ?? defaultPdfSettings),
                        translateTableText: checked,
                      },
                    })
                  }
                  label="Translate table text"
                  description="Off by default: table grids stay on the canvas. When on, non-numeric labels may translate; numbers stay protected."
                />
                <Toggle
                  checked={strictMathSkip}
                  onChange={(checked) =>
                    updateSettings({
                      pdfSettings: {
                        ...(settings.pdfSettings ?? defaultPdfSettings),
                        strictMathSkip: checked,
                      },
                    })
                  }
                  label="Strict math skip"
                  description="More aggressive formula classification (size ratio and density). Off by default to avoid under-translating."
                />
                <Toggle
                  checked={autoExtractTerms}
                  onChange={(checked) =>
                    updateSettings({
                      pdfSettings: {
                        ...(settings.pdfSettings ?? defaultPdfSettings),
                        autoExtractTerms: checked,
                      },
                    })
                  }
                  label="Auto extract terms"
                  description="Before multi-page translation, sample prose and extract a technical term list for consistent terminology. On by default; fails open if extraction fails."
                />
                <Toggle
                  checked={detectScanned}
                  onChange={(checked) =>
                    updateSettings({
                      pdfSettings: {
                        ...(settings.pdfSettings ?? defaultPdfSettings),
                        detectScanned: checked,
                      },
                    })
                  }
                  label="Detect scanned PDFs"
                  description="Score pages with little/no extractable text vs page area. On by default."
                />
                <Toggle
                  checked={autoOcrWorkaround}
                  onChange={(checked) =>
                    updateSettings({
                      pdfSettings: {
                        ...(settings.pdfSettings ?? defaultPdfSettings),
                        autoOcrWorkaround: checked,
                      },
                    })
                  }
                  label="Auto OCR workaround"
                  description="When a heavily scanned document is detected, force white underlays and text overlay assumptions. On by default; pure-scan no-text docs show a message instead."
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Scientific PDF (layout-preserving bridge) */}
        <div className="animate-stagger" style={stagger(5)}>
          <Card
            variant="bordered"
            accent="amber"
            title="Scientific PDF"
            description="PDF translation runs only via a local Docker bridge (pdf2zh). When the bridge is offline, PDF Translate shows as unavailable in the viewer."
            icon={<FlaskConical className="w-3.5 h-3.5" />}
            headerExtra={<Badge variant={scientificBadge.variant}>{scientificBadge.label}</Badge>}
          >
            <div className="grid gap-4">
              <Toggle
                checked={scientificPdf.enabled}
                onChange={(checked) =>
                  updateSettings({
                    scientificPdf: {
                      ...scientificPdf,
                      enabled: checked,
                    },
                  })
                }
                label="Enable PDF bridge"
                description="Required for PDF Translate. Uses the same provider pool as normal page translation. There is no in-browser Fast PDF path."
              />
              <FieldGroup
                label="Bridge server URL"
                description="Default is loopback. Credentials and the full PDF are sent here only for PDF translate jobs."
                htmlFor="scientific-pdf-server-url"
              >
                <Input
                  id="scientific-pdf-server-url"
                  type="text"
                  value={scientificPdf.serverUrl}
                  onChange={(e) =>
                    updateSettings({
                      scientificPdf: {
                        ...scientificPdf,
                        serverUrl: e.target.value,
                      },
                    })
                  }
                  placeholder={DEFAULT_SCIENTIFIC_PDF_SETTINGS.serverUrl}
                />
              </FieldGroup>
              {scientificNonLoopback && (
                <p className="text-xs text-rose-300" role="status">
                  Warning: server URL is not loopback. You may send PDFs and API keys to a remote
                  host — only continue if you trust it.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => setShowScientificWizard(true)}>
                  Set up…
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void refreshScientificHealth()}
                >
                  Refresh status
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                Privacy: Scientific mode sends the full PDF plus short-lived provider credentials to
                the configured server URL. Prefer{' '}
                <code className="rounded bg-zinc-800 px-1">http://127.0.0.1</code> only. No second
                API key store — the active pool is used per job.
              </p>
            </div>
          </Card>
        </div>

        <ScientificPdfWizard
          open={showScientificWizard}
          onClose={() => {
            setShowScientificWizard(false);
            void refreshScientificHealth();
          }}
        />

        {/* Data Portability */}
        <div className="animate-stagger" style={stagger(6)}>
          <Card
            variant="bordered"
            title="Data Portability"
            description="Back up or restore settings as JSON. Useful before resets or when moving browsers."
            icon={<Database className="w-3.5 h-3.5" />}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.03]">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/25 bg-blue-500/10 text-blue-400">
                  <Download className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-100">Export settings</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                    Download a JSON backup of providers, rules, glossary, and preferences.
                  </p>
                </div>
                <Button
                  id="export-settings-btn"
                  variant="secondary"
                  size="sm"
                  onClick={handleExportSettings}
                  icon={<Download className="w-3.5 h-3.5" />}
                  className="w-full sm:w-auto"
                >
                  Export JSON
                </Button>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.03]">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
                  <Upload className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-100">Import settings</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                    Merge a previous export. Unknown keys are ignored safely.
                  </p>
                </div>
                <Button
                  id="import-settings-btn"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  icon={<Upload className="w-3.5 h-3.5" />}
                  className="w-full sm:w-auto"
                >
                  Import JSON
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
            </div>

            <div
              className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${
                settings.provider?.apiKey
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-zinc-800 bg-zinc-900/40 text-zinc-500'
              }`}
            >
              {settings.provider?.apiKey ? (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden="true" />
              )}
              <span>
                {settings.provider?.apiKey
                  ? 'Export includes your provider API key in cleartext. Treat the file as a secret and never share it.'
                  : 'Exports include provider configuration. Add an API key and it will be stored in the file as cleartext — keep backups private.'}
              </span>
            </div>
          </Card>
        </div>

        {/* Developer */}
        <div className="animate-stagger" style={stagger(7)}>
          <Card
            variant="bordered"
            accent={settings.debugMode ? 'amber' : undefined}
            title="Developer"
            description="Diagnostics for troubleshooting translation and content-script issues."
            icon={<Bug className="w-3.5 h-3.5" />}
            headerExtra={
              settings.debugMode ? <Badge variant="warning">Logging on</Badge> : undefined
            }
          >
            <div
              className={`rounded-xl border px-4 py-3.5 transition-colors ${
                settings.debugMode
                  ? 'border-amber-500/25 bg-amber-500/[0.06]'
                  : 'border-zinc-800/80 bg-zinc-950/30'
              }`}
            >
              <Toggle
                id="debug-mode-toggle"
                checked={settings.debugMode}
                onChange={(checked) => updateSettings({ debugMode: checked })}
                label="Debug mode"
                description="Verbose logs in the browser console (background + content scripts). Turn off after debugging — it can be noisy."
              />
            </div>
          </Card>
        </div>

        {/* Danger Zone — isolated, severity-ranked destructive actions */}
        <div className="animate-stagger" style={stagger(8)}>
          <DangerZone description="Irreversible or costly actions. Export a backup first if you plan to reset.">
            <DangerAction
              severity="caution"
              icon={<Trash2 />}
              title="Clear translation cache"
              description="Deletes every stored translation. The next pages you open will re-fetch from your provider and may incur API costs."
              meta={
                <div className="inline-flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700/80 bg-zinc-900/70 px-2 py-1 font-medium tabular-nums text-zinc-300">
                    <HardDrive className="h-3 w-3 text-zinc-500" aria-hidden="true" />
                    {cacheStats.loading
                      ? 'Measuring cache…'
                      : `${cacheStats.entryCount.toLocaleString()} entries · ${cacheStats.sizeLabel}`}
                  </span>
                  {!cacheStats.loading && cacheStats.entryCount === 0 && (
                    <span className="text-zinc-600">Cache is already empty</span>
                  )}
                </div>
              }
              action={
                <Button
                  id="clear-cache-btn"
                  variant="warning"
                  size="sm"
                  onClick={() => setShowClearCacheModal(true)}
                  disabled={clearStatus === 'clearing'}
                  loading={clearStatus === 'clearing'}
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  {clearStatus === 'done' ? 'Cleared' : 'Clear cache'}
                </Button>
              }
            />

            <DangerAction
              severity="critical"
              icon={<ShieldAlert />}
              title="Reset all settings"
              description="Restores factory defaults. Provider keys, dictionary, site rules, themes, and prompts are wiped. Cannot be undone."
              meta={
                <p className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <Download className="h-3 w-3 shrink-0 text-zinc-600" aria-hidden="true" />
                  Tip: use <span className="font-medium text-zinc-400">Data Portability → Export</span> above first.
                </p>
              }
              action={
                <Button
                  id="reset-all-settings-btn"
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowResetModal(true)}
                  icon={<RotateCcw className="w-3.5 h-3.5" />}
                >
                  Reset everything
                </Button>
              }
            />
          </DangerZone>
        </div>
      </div>

      {/* Clear Cache Confirmation Modal */}
      {showClearCacheModal && (
        <Modal
          title="Clear translation cache?"
          message={
            <div className="space-y-3">
              <p>
                This permanently deletes all cached translations
                {!cacheStats.loading && cacheStats.entryCount > 0
                  ? ` (${cacheStats.entryCount.toLocaleString()} entries · ${cacheStats.sizeLabel})`
                  : ''}
                .
              </p>
              <ul className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-xs text-zinc-400">
                <li className="flex gap-2">
                  <span className="text-amber-400/80">•</span>
                  Future pages re-fetch from your provider
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400/80">•</span>
                  May incur additional API costs
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400/70">•</span>
                  Settings, dictionary, and site rules are kept
                </li>
              </ul>
            </div>
          }
          variant="danger"
          confirmLabel="Clear cache"
          cancelLabel="Keep cache"
          onConfirm={handleClearCache}
          onCancel={() => setShowClearCacheModal(false)}
        />
      )}

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <Modal
          title="Reset all settings?"
          message={
            <div className="space-y-3">
              <p>Everything returns to factory defaults. This cannot be undone.</p>
              <ul className="space-y-1.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2.5 text-xs text-zinc-400">
                <li className="flex gap-2">
                  <span className="text-rose-400">•</span>
                  Provider API keys and endpoints
                </li>
                <li className="flex gap-2">
                  <span className="text-rose-400">•</span>
                  Custom dictionary and site rules
                </li>
                <li className="flex gap-2">
                  <span className="text-rose-400">•</span>
                  Themes, prompts, and performance tuning
                </li>
              </ul>
              <p className="text-xs text-amber-300/80">
                Export a backup from Data Portability first if you might need these later.
              </p>
            </div>
          }
          variant="danger"
          confirmLabel="Reset everything"
          cancelLabel="Keep settings"
          onConfirm={handleReset}
          onCancel={() => setShowResetModal(false)}
        />
      )}
    </div>
  );
}
