/**
 * A single API key row within a provider (FR-1 extraction).
 *
 * Extracted from `ProvidersSection.tsx` (`KeyRow`); reuses
 * `useConnectionTest` + `ProviderTestResult`.
 */

import { useState } from 'react';
import { ExternalLink, KeyRound, Trash2 } from 'lucide-react';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Toggle } from '@/ui/Toggle';
import { AdvancedDisclosure } from '@/ui/AdvancedDisclosure';
import { ConnectionTestProgressList } from './ConnectionTestProgressList';
import { ProviderTestResult } from './ProviderTestResult';
import { useConnectionTest } from '../hooks/useConnectionTest';
import { useDeferredCommit } from '../hooks/useDeferredCommit';
import { getConnectionErrorMessage } from '@/lib/providerReadiness';
import { getCatalogEntryById, getKeyUrlForProvider } from '@/lib/openAiCompatibleCatalog';
import { inferCatalogId } from './ProviderCatalogPicker';
import {
  buildProviderConfig,
  canRunConnectionTest,
} from '@/lib/providerPoolHelpers';
import type { PoolKey, PoolProvider } from '@/types/config';

interface ProviderKeyRowProps {
  provider: PoolProvider;
  poolKey: PoolKey;
  targetLanguage: string;
  onUpdate: (patch: Partial<PoolKey>) => void;
  onRemove: () => void;
}

export function ProviderKeyRow({
  provider,
  poolKey,
  targetLanguage,
  onUpdate,
  onRemove,
}: ProviderKeyRowProps) {
  const [maxRpmDraft, setMaxRpmDraft] = useState(String(poolKey.maxRpm));
  // FR-5: per-key concurrency limit + throttle interval drafts.
  const [concurrencyDraft, setConcurrencyDraft] = useState(String(poolKey.concurrencyLimit ?? 0));
  const [intervalDraft, setIntervalDraft] = useState(String(poolKey.interval ?? 0));
  // FR-10: defer the encrypted store write until blur. Local value updates
  // immediately for responsiveness; the (AES-GCM) chrome.storage write only
  // fires on blur, killing per-keystroke encryption overhead.
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

  const handleTest = async () => {
    const result = await runTest(
      buildProviderConfig(provider, poolKey),
      `Key "${poolKey.label || 'key'}" is healthy`,
    );
    onUpdate({
      lastTestResult: {
        success: result.overall,
        at: Date.now(),
        latencyMs: result.totalLatencyMs,
        error: result.overall ? undefined : result.steps.find((s) => !s.success)?.error,
      },
    });
  };

  const commitMaxRpm = () => {
    const n = Math.max(0, Math.min(600, Math.floor(Number(maxRpmDraft) || 0)));
    setMaxRpmDraft(String(n));
    if (n !== poolKey.maxRpm) onUpdate({ maxRpm: n });
  };
  // FR-5: per-key concurrency limit (0 = global cap only) + throttle interval (0 = off).
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

  return (
    <div data-key-id={poolKey.id} className="rounded-lg border border-zinc-700/60 p-4 space-y-4 bg-zinc-900/40">
      <div className="flex items-center gap-2">
        <KeyRound className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span className="text-xs text-zinc-400 font-mono">{poolKey.label || poolKey.id}</span>
        <Badge variant={poolKey.enabled ? 'success' : 'info'}>
          {poolKey.enabled ? 'on' : 'off'}
        </Badge>
      </div>

      {provider.requiresApiKey ? (
        <FieldGroup label="API key" htmlFor={`pk-${poolKey.id}`}>
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
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1"
            >
              Get a key <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </FieldGroup>
      ) : (
        <div className="rounded-lg border border-zinc-700/40 bg-zinc-800/30 px-3 py-2">
          <p className="text-xs text-zinc-500">No key required for this provider</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <FieldGroup label="Label (optional)" htmlFor={`pl-${poolKey.id}`}>
          <Input
            id={`pl-${poolKey.id}`}
            value={labelField.value}
            onChange={(e) => labelField.setValue(e.target.value)}
            onBlur={labelField.commit}
            placeholder="prod / staging"
          />
        </FieldGroup>
        <FieldGroup label="Max RPM (0 = unlimited)" htmlFor={`pr-${poolKey.id}`}>
          <Input
            id={`pr-${poolKey.id}`}
            type="number"
            min={0}
            max={600}
            value={maxRpmDraft}
            onChange={(e) => setMaxRpmDraft(e.target.value)}
            onBlur={commitMaxRpm}
            hint="Cap is 600 RPM; 0 = unlimited"
          />
        </FieldGroup>
      </div>

      <AdvancedDisclosure label="Concurrency & throttle (advanced)">
        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="Concurrency limit (0 = global only)" htmlFor={`pc-${poolKey.id}`}>
            <Input
              id={`pc-${poolKey.id}`}
              type="number"
              min={0}
              max={20}
              value={concurrencyDraft}
              onChange={(e) => setConcurrencyDraft(e.target.value)}
              onBlur={commitConcurrency}
              hint="0–20 in-flight requests (0 = global cap)"
            />
          </FieldGroup>
          <FieldGroup label="Throttle interval ms (0 = off)" htmlFor={`pi-${poolKey.id}`}>
            <Input
              id={`pi-${poolKey.id}`}
              type="number"
              min={0}
              max={60000}
              value={intervalDraft}
              onChange={(e) => setIntervalDraft(e.target.value)}
              onBlur={commitInterval}
              hint="Min ms between requests (0 = off)"
            />
          </FieldGroup>
        </div>
      </AdvancedDisclosure>

      <div className="flex items-center justify-between gap-4 pt-3 border-t border-zinc-700/40">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <Toggle
            checked={poolKey.enabled}
            onChange={(enabled) => onUpdate({ enabled })}
          />
          <span className={`text-sm font-medium transition-colors ${
            poolKey.enabled ? 'text-zinc-200' : 'text-zinc-500'
          }`}>
            {poolKey.enabled ? 'Key active' : 'Key disabled'}
          </span>
        </label>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={isTesting}
            disabled={!canTest}
            onClick={handleTest}
          >
            {isTesting ? 'Testing...' : 'Test'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
      </div>

      {provider.requiresApiKey && !canTest && !isTesting && (
        <p className="text-xs text-zinc-500">
          Enter an API key to test this key.
        </p>
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
