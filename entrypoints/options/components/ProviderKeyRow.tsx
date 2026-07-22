/**
 * Compact API key row with rate-limit summary strip, presets, and live status chip.
 */

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GripVertical,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import type { KeyChipView } from '@/lib/poolDashboardStatus';
import {
  formatKeyRateLimitSummary,
  getKeyRateLimitPresetValues,
  KEY_RATE_LIMIT_PRESETS,
  matchKeyRateLimitPreset,
  type KeyRateLimitValues,
} from '@/lib/keyRateLimits';
import { getConnectionErrorMessage } from '@/lib/providerReadiness';
import { getCatalogEntryById, getKeyUrlForProvider } from '@/lib/openAiCompatibleCatalog';
import {
  buildProviderConfig,
  canRunConnectionTest,
} from '@/lib/providerPoolHelpers';
import type { PoolKey, PoolProvider } from '@/types/config';
import { Button } from '@/ui/Button';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Toggle } from '@/ui/Toggle';
import { ConnectionTestProgressList } from './ConnectionTestProgressList';
import { ProviderTestResult } from './ProviderTestResult';
import { useConnectionTest } from '../hooks/useConnectionTest';
import { useDeferredCommit } from '../hooks/useDeferredCommit';
import { inferCatalogId } from './ProviderCatalogPicker';

const CHIP_TONE: Record<KeyChipView['kind'], string> = {
  healthy: 'bg-emerald-600/15 border-emerald-500/20 text-emerald-400',
  failed: 'bg-red-600/15 border-red-500/20 text-red-400',
  cooling: 'bg-amber-600/15 border-amber-500/20 text-amber-400',
  invalid: 'bg-red-600/15 border-red-500/20 text-red-400',
  off: 'bg-zinc-600/15 border-zinc-500/20 text-zinc-500',
  untested: 'bg-amber-600/15 border-amber-500/20 text-amber-400',
};

interface ProviderKeyRowProps {
  provider: PoolProvider;
  poolKey: PoolKey;
  targetLanguage: string;
  chip: KeyChipView;
  displayIndex: number;
  onUpdate: (patch: Partial<PoolKey>) => void;
  onRemove: () => void;
  onMove?: (direction: 'up' | 'down') => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}

export function ProviderKeyRow({
  provider,
  poolKey,
  targetLanguage,
  chip,
  displayIndex,
  onUpdate,
  onRemove,
  onMove,
  dragHandleProps,
}: ProviderKeyRowProps) {
  const [maxRpmDraft, setMaxRpmDraft] = useState(String(poolKey.maxRpm));
  const [concurrencyDraft, setConcurrencyDraft] = useState(
    String(poolKey.concurrencyLimit ?? 0),
  );
  const [intervalDraft, setIntervalDraft] = useState(String(poolKey.interval ?? 0));
  const [rateLimitsOpen, setRateLimitsOpen] = useState(false);
  const apiKeyField = useDeferredCommit(poolKey.apiKey, (v) => onUpdate({ apiKey: v }));
  const labelField = useDeferredCommit(poolKey.label ?? '', (v) => onUpdate({ label: v }));
  const { isTesting, testProgress, testResult, runTest } = useConnectionTest(targetLanguage);
  const canTest = canRunConnectionTest(provider, poolKey);
  const failedStep = testResult?.steps.find((s) => !s.success);
  const failedMessage = getConnectionErrorMessage(failedStep?.error);

  const catalogId = provider.catalogId ?? inferCatalogId(provider.baseUrl);
  const catalogEntry = getCatalogEntryById(catalogId);
  const keyPlaceholder = catalogEntry?.placeholder ?? 'sk-...';
  const getKeyUrl = getKeyUrlForProvider(provider.baseUrl);
  const displayLabel = poolKey.label?.trim() || `Key ${displayIndex}`;

  const committedLimits: KeyRateLimitValues = {
    maxRpm: poolKey.maxRpm,
    concurrencyLimit: poolKey.concurrencyLimit ?? 0,
    interval: poolKey.interval ?? 0,
  };
  const summary = formatKeyRateLimitSummary(committedLimits);
  const activePreset = matchKeyRateLimitPreset(committedLimits);
  const regionId = `rate-limits-${poolKey.id}`;
  const rateLimitsBtnId = `rate-limits-btn-${poolKey.id}`;

  const handleTest = async () => {
    const result = await runTest(
      buildProviderConfig(provider, poolKey),
      `Key "${displayLabel}" is healthy`,
    );
    onUpdate({
      lastTestResult: {
        success: result.overall,
        at: Date.now(),
        latencyMs: result.totalLatencyMs,
        error: result.overall
          ? undefined
          : result.steps.find((s) => !s.success)?.error,
      },
    });
  };

  const commitMaxRpm = () => {
    const n = Math.max(0, Math.min(600, Math.floor(Number(maxRpmDraft) || 0)));
    setMaxRpmDraft(String(n));
    if (n !== poolKey.maxRpm) onUpdate({ maxRpm: n });
  };
  const commitConcurrency = () => {
    const n = Math.max(0, Math.min(20, Math.floor(Number(concurrencyDraft) || 0)));
    setConcurrencyDraft(String(n));
    if (n !== (poolKey.concurrencyLimit ?? 0)) onUpdate({ concurrencyLimit: n });
  };
  const commitInterval = () => {
    const n = Math.max(0, Math.min(60000, Math.floor(Number(intervalDraft) || 0)));
    setIntervalDraft(String(n));
    if (n !== (poolKey.interval ?? 0)) onUpdate({ interval: n });
  };

  const applyRateLimits = (values: KeyRateLimitValues) => {
    setMaxRpmDraft(String(values.maxRpm));
    setConcurrencyDraft(String(values.concurrencyLimit));
    setIntervalDraft(String(values.interval));
    onUpdate({
      maxRpm: values.maxRpm,
      concurrencyLimit: values.concurrencyLimit,
      interval: values.interval,
    });
  };

  return (
    <div
      data-key-id={poolKey.id}
      className="rounded-lg border border-zinc-700/60 p-3 space-y-3 bg-zinc-900/40"
    >
      <div className="flex items-center gap-2">
        {dragHandleProps && (
          <button
            type="button"
            className="p-0.5 text-zinc-600 hover:text-zinc-400 cursor-grab"
            aria-label={`Drag ${displayLabel}`}
            {...dragHandleProps}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}
        <span
          className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${CHIP_TONE[chip.kind]}`}
          title={chip.title}
        >
          {chip.label}
        </span>
        <span className="text-xs text-zinc-300 font-medium truncate flex-1">
          {displayLabel}
        </span>
        <Toggle
          checked={poolKey.enabled}
          onChange={(enabled) => onUpdate({ enabled })}
        />
        <Button
          size="sm"
          variant="secondary"
          loading={isTesting}
          disabled={!canTest}
          onClick={handleTest}
        >
          {isTesting ? 'Testing...' : 'Test'}
        </Button>
        <div className="relative group">
          <Button
            size="sm"
            variant="ghost"
            icon={<MoreHorizontal className="w-3.5 h-3.5" />}
            aria-label={`${displayLabel} menu`}
          />
          <div className="absolute right-0 top-full mt-1 hidden group-hover:block group-focus-within:block z-10 min-w-[10rem] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
            {onMove && (
              <>
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
                  onClick={() => onMove('up')}
                >
                  <ChevronUp className="w-3 h-3" /> Move up
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
                  onClick={() => onMove('down')}
                >
                  <ChevronUp className="w-3 h-3 rotate-180" /> Move down
                </button>
              </>
            )}
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs text-rose-400 hover:bg-zinc-800 flex items-center gap-2"
              onClick={onRemove}
            >
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>
        </div>
      </div>

      <FieldGroup
        label="API key"
        htmlFor={`pk-${poolKey.id}`}
        description={
          provider.requiresApiKey
            ? undefined
            : 'Optional — leave blank for local or unauthenticated endpoints.'
        }
      >
        <Input
          id={`pk-${poolKey.id}`}
          type="password"
          value={apiKeyField.value}
          onChange={(e) => apiKeyField.setValue(e.target.value)}
          onBlur={apiKeyField.commit}
          placeholder={keyPlaceholder}
          className="font-mono"
        />
        {getKeyUrl && (
          <a
            href={getKeyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors mt-1"
          >
            Get a key <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </FieldGroup>

      <FieldGroup label="Label (optional)" htmlFor={`pl-${poolKey.id}`}>
        <Input
          id={`pl-${poolKey.id}`}
          value={labelField.value}
          onChange={(e) => labelField.setValue(e.target.value)}
          onBlur={labelField.commit}
          placeholder="prod / staging"
        />
      </FieldGroup>

      <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/30">
        <button
          type="button"
          id={rateLimitsBtnId}
          aria-expanded={rateLimitsOpen}
          aria-controls={regionId}
          aria-label={`Rate limits, ${summary}`}
          onClick={() => setRateLimitsOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/40 transition-colors rounded-lg"
        >
          <span className="text-xs font-medium text-zinc-300 shrink-0">Rate limits</span>
          <span className="text-xs text-zinc-500 font-mono truncate flex-1" title={summary}>
            {summary}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform duration-200 ${
              rateLimitsOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {rateLimitsOpen && (
          <div
            id={regionId}
            role="region"
            aria-labelledby={rateLimitsBtnId}
            className="px-3 pb-3 space-y-3 border-t border-zinc-700/40"
          >
            <p className="text-xs text-zinc-500 leading-relaxed pt-3">
              Limits how fast this key hits the API. Presets are a starting point — tweak the
              numbers if you need to.
            </p>

            <div
              role="radiogroup"
              aria-label="Rate limit presets"
              className="flex flex-wrap gap-1.5"
            >
              {KEY_RATE_LIMIT_PRESETS.map((preset) => {
                const selected = activePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => applyRateLimits(preset.values)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      selected
                        ? 'bg-cyan-600/20 border-cyan-500/40 text-cyan-300'
                        : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
              {activePreset === null && (
                <span className="px-2 py-1 text-xs text-zinc-500 self-center">Custom</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FieldGroup
                label="Max rate"
                description="Requests this key may start per minute."
                htmlFor={`pr-${poolKey.id}`}
              >
                <Input
                  id={`pr-${poolKey.id}`}
                  type="number"
                  min={0}
                  max={600}
                  value={maxRpmDraft}
                  onChange={(e) => setMaxRpmDraft(e.target.value)}
                  onBlur={commitMaxRpm}
                  suffix="req/min"
                  placeholder="20"
                  hint="0 = unlimited · 0–600"
                />
              </FieldGroup>
              <FieldGroup
                label="Max concurrent"
                description="In-flight requests at the same time."
                htmlFor={`pc-${poolKey.id}`}
              >
                <Input
                  id={`pc-${poolKey.id}`}
                  type="number"
                  min={0}
                  max={20}
                  value={concurrencyDraft}
                  onChange={(e) => setConcurrencyDraft(e.target.value)}
                  onBlur={commitConcurrency}
                  suffix="at once"
                  placeholder="1"
                  hint="0 = global cap only · 0–20"
                />
              </FieldGroup>
              <FieldGroup
                label="Min gap"
                description="Wait after one request before the next."
                htmlFor={`pi-${poolKey.id}`}
              >
                <Input
                  id={`pi-${poolKey.id}`}
                  type="number"
                  min={0}
                  max={60000}
                  value={intervalDraft}
                  onChange={(e) => setIntervalDraft(e.target.value)}
                  onBlur={commitInterval}
                  suffix="ms"
                  placeholder="500"
                  hint="0 = off · 0–60000 · 1000 ms = 1 s"
                />
              </FieldGroup>
            </div>

            <button
              type="button"
              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              onClick={() => applyRateLimits(getKeyRateLimitPresetValues('safe'))}
            >
              Reset to Safe
            </button>
          </div>
        )}
      </div>

      {provider.requiresApiKey && !canTest && !isTesting && (
        <p className="text-xs text-zinc-500">Enter an API key to test this key.</p>
      )}

      <ConnectionTestProgressList steps={testProgress} isTesting={isTesting} />
      <ProviderTestResult
        testResult={testResult}
        failureTitle={failedMessage.title}
        failureAction={failedMessage.action}
        successLabel="Key connection successful."
      />
    </div>
  );
}
