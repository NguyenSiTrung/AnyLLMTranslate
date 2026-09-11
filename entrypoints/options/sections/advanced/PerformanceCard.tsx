/**
 * PerformanceCard — cache health, common limits, and specialist request
 * budgets, extracted from the monolithic AdvancedSection. Cache clearing is
 * a recoverable maintenance action, so it lives here behind confirmation —
 * not in the Danger Zone.
 */

import { useState } from 'react';
import { HardDrive, Trash2 } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  useDeferredCommit,
  type UseDeferredCommitResult,
} from '@/entrypoints/options/hooks/useDeferredCommit';
import { useCacheStats } from '@/entrypoints/options/hooks/useCacheStats';
import { useToast } from '@/ui/ToastProvider';
import { Card } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Toggle } from '@/ui/Toggle';
import { Modal } from '@/ui/Modal';
import { Input } from '@/ui/Input';
import { FieldGroup } from '@/ui/FieldGroup';
import { SettingsGroup } from '@/ui/SettingsGroup';
import { AdvancedDisclosure } from '@/ui/AdvancedDisclosure';

interface NumberDraftFieldProps {
  id: string;
  label: string;
  description: string;
  hint: string;
  min: number;
  max: number;
  field: UseDeferredCommitResult<number>;
  onBlur?: () => void;
  error?: string;
  suffix?: string;
}

function NumberDraftField({
  id,
  label,
  description,
  hint,
  min,
  max,
  field,
  onBlur,
  error,
  suffix,
}: NumberDraftFieldProps) {
  return (
    <FieldGroup label={label} description={description} htmlFor={id}>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={field.value}
        onChange={(event) => field.setValue(Number(event.target.value))}
        onBlur={onBlur ?? field.commit}
        hint={hint}
        error={error}
        suffix={suffix}
      />
    </FieldGroup>
  );
}

export function PerformanceCard() {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const cacheStats = useCacheStats();
  const { success: showSuccess, error: showError } = useToast();
  const [clearStatus, setClearStatus] = useState<'idle' | 'clearing' | 'done'>('idle');
  const [showClearCacheModal, setShowClearCacheModal] = useState(false);

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

  const handleClearCache = async () => {
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
  };

  const cacheLimitMb = Number(maxCacheField.value) || settings.maxCacheSizeMB || 1;
  const cacheUsagePct = cacheStats.loading
    ? 0
    : Math.min(100, Math.round((cacheStats.sizeMb / cacheLimitMb) * 100));
  const cacheBarTone =
    cacheUsagePct >= 90 ? 'bg-rose-500' : cacheUsagePct >= 70 ? 'bg-amber-500' : 'bg-cyan-500';

  return (
    <Card
      variant="bordered"
      title="Performance"
      description="Cache health, storage limits, and provider request tuning."
      icon={<HardDrive className="w-3.5 h-3.5" />}
      headerExtra={
        !cacheStats.loading ? (
          <span className="text-[11px] tabular-nums text-zinc-500">
            {cacheStats.entryCount.toLocaleString()} cached
          </span>
        ) : null
      }
    >
      <div className="space-y-6">
        <SettingsGroup title="Cache" description="How long and how much translation data is stored locally.">
          <div className="grid gap-5 sm:grid-cols-2">
            <NumberDraftField
              id="cache-ttl-input"
              label="Cache lifetime (days)"
              description="How long translations stay cached before expiring."
              hint="1–365 days"
              min={1}
              max={365}
              field={ttlField}
              onBlur={handleCacheTTLBlur}
              error={cacheTTLError}
            />
            <NumberDraftField
              id="max-cache-size-input"
              label="Storage limit (MB)"
              description="Hard ceiling for local cache storage."
              hint="10–1000 MB"
              min={10}
              max={1000}
              field={maxCacheField}
              onBlur={handleMaxCacheSizeBlur}
              error={maxCacheSizeError}
            />
          </div>
          {!cacheStats.loading && (
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-zinc-500">
                <span>
                  {cacheStats.entryCount.toLocaleString()} entries in use
                </span>
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
          <div>
            <Button
              id="clear-cache-btn"
              variant="warning"
              size="sm"
              onClick={() => setShowClearCacheModal(true)}
              disabled={clearStatus === 'clearing' || (!cacheStats.loading && cacheStats.entryCount === 0)}
              loading={clearStatus === 'clearing'}
              icon={<Trash2 className="w-3.5 h-3.5" />}
            >
              {clearStatus === 'done' ? 'Cleared' : 'Clear cache'}
            </Button>
            {!cacheStats.loading && cacheStats.entryCount === 0 && (
              <span className="ml-2 text-[11px] text-zinc-600">Cache is already empty</span>
            )}
          </div>
        </SettingsGroup>

        <SettingsGroup title="Throughput" description="Calls per minute to your provider.">
          <NumberDraftField
            id="max-rpm-input"
            label="Provider requests per minute"
            description="Cap provider calls to avoid rate limits. Use 0 for unlimited (local LLMs)."
            hint="Unit: requests per minute · 0 = unlimited · range 0–600"
            min={0}
            max={600}
            field={maxRpmField}
            onBlur={handleMaxRpmBlur}
            error={maxRpmError}
            suffix="req/min"
          />
          {maxRpmField.value === 0 && !maxRpmError && (
            <div className="mt-2">
              <Badge variant="info">Unlimited · good for Ollama / LM Studio</Badge>
            </div>
          )}
        </SettingsGroup>

        <AdvancedDisclosure label="Custom performance tuning" idPrefix="advanced-performance-custom">
          <div className="grid gap-5 sm:grid-cols-2">
            <NumberDraftField
              id="max-batch-chars-input"
              label="Maximum batch characters"
              description="Largest text batch sent in one translation request."
              hint="500–10000 · default 2000"
              min={500}
              max={10000}
              field={maxBatchField}
              onBlur={handleMaxBatchCharsBlur}
              error={maxBatchCharsError}
            />
            <NumberDraftField
              id="max-text-group-input"
              label="Maximum pieces per request"
              description="Paragraphs grouped into one request; 0 removes this limit."
              hint="0–50 · default 4"
              min={0}
              max={50}
              field={maxGroupField}
            />
            <NumberDraftField
              id="max-text-length-input"
              label="Maximum characters per request"
              description="Total characters grouped into one request; 0 removes this limit."
              hint="0–20000 · default 2000"
              min={0}
              max={20000}
              field={maxLengthField}
            />
            <NumberDraftField
              id="failure-ttl-input"
              label="Failure memory lifetime (minutes)"
              description="How long a failed request is remembered before retry."
              hint="1–1440 min · default 120"
              min={1}
              max={1440}
              field={failureTtlField}
            />
          </div>
          <div className="mt-4">
            <Toggle
              id="adaptive-batching-toggle"
              checked={settings.enableAdaptiveBatching}
              onChange={(checked) => updateSettings({ enableAdaptiveBatching: checked })}
              label="Adjust request size automatically"
              description="Adapts pieces/characters per request from recent provider latency; the fixed limits above still cap requests."
            />
          </div>
        </AdvancedDisclosure>
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
          onConfirm={() => void handleClearCache()}
          onCancel={() => setShowClearCacheModal(false)}
        />
      )}
    </Card>
  );
}
