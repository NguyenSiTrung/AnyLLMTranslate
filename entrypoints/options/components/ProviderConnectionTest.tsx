/**
 * Provider-level connection test panel (FR-1 extraction).
 *
 * Tests using the first key with credentials. Extracted from
 * `ProvidersSection.tsx`; reuses `useConnectionTest` + `ProviderTestResult`.
 */

import { Loader2, Zap } from 'lucide-react';
import { Button } from '@/ui/Button';
import { ConnectionTestProgressList } from './ConnectionTestProgressList';
import { ProviderTestResult } from './ProviderTestResult';
import { useConnectionTest } from '../hooks/useConnectionTest';
import { getConnectionErrorMessage } from '@/lib/providerReadiness';
import {
  buildProviderConfig,
  canRunConnectionTest,
  getCredentialKey,
} from '@/lib/providerPoolHelpers';
import type { PoolProvider, KeyTestResult } from '@/types/config';

interface ProviderConnectionTestProps {
  provider: PoolProvider;
  targetLanguage: string;
  onTestComplete?: (result: KeyTestResult) => void;
}

export function ProviderConnectionTest({
  provider,
  targetLanguage,
  onTestComplete,
}: ProviderConnectionTestProps) {
  const { isTesting, testProgress, testResult, runTest } = useConnectionTest(targetLanguage);
  const testKey = getCredentialKey(provider);
  const canTest = testKey ? canRunConnectionTest(provider, testKey) : false;
  const failedStep = testResult?.steps.find((s) => !s.success);
  const failedMessage = getConnectionErrorMessage(failedStep?.error);

  const handleTest = async () => {
    if (!testKey) return;
    const result = await runTest(
      buildProviderConfig(provider, testKey),
      `${provider.displayName || 'Provider'} connection verified`,
    );
    onTestComplete?.({
      success: result.overall,
      at: Date.now(),
      latencyMs: result.totalLatencyMs,
      error: result.overall ? undefined : failedStep?.error,
    });
  };

  return (
    <div className="rounded-lg border border-zinc-700/60 p-4 space-y-3 bg-zinc-900/30">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-200">Test connection</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Validates reachability, model listing, and a sample translation.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          loading={isTesting}
          disabled={!canTest}
          icon={!isTesting ? <Zap className="w-3.5 h-3.5" /> : undefined}
          onClick={handleTest}
        >
          {isTesting ? 'Testing...' : 'Test'}
        </Button>
      </div>
      {!canTest && (
        <p className="text-xs text-zinc-500">
          Add a base URL, model, and API key before testing.
        </p>
      )}
      <ConnectionTestProgressList steps={testProgress} isTesting={isTesting} />
      {isTesting && testProgress.length === 0 && (
        <p className="text-xs text-zinc-400">
          <Loader2 className="inline w-3.5 h-3.5 animate-spin mr-1.5" />
          Starting connection test...
        </p>
      )}
      <ProviderTestResult
        testResult={testResult}
        failureTitle={failedMessage.title}
        failureAction={failedMessage.action}
        successLabel="Connection successful."
      />
    </div>
  );
}
