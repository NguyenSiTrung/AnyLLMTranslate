/**
 * Shared connection-test result block (FR-1 dedup).
 *
 * Renders the success line and the failure card. Previously copy-pasted
 * in both `ProviderConnectionTest` and `ProviderKeyRow` (which differed only
 * in the success label). Kept presentational — error-message resolution is
 * the caller's job so this stays free of `providerReadiness` imports.
 */

import type { ConnectionTestResult } from '@/services/providerTester';

interface ProviderTestResultProps {
  testResult: ConnectionTestResult | null;
  /** Title shown in the failure card (already localized/classified). */
  failureTitle: string;
  /** Action shown under the failure title. */
  failureAction: string;
  /** Label shown on success, e.g. "Connection successful." */
  successLabel: string;
}

export function ProviderTestResult({
  testResult,
  failureTitle,
  failureAction,
  successLabel,
}: ProviderTestResultProps) {
  return (
    <>
      {testResult && !testResult.overall && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
          <p className="text-xs font-medium text-red-300">{failureTitle}</p>
          <p className="text-xs text-red-200/80 mt-1">{failureAction}</p>
        </div>
      )}
      {testResult?.overall && (
        <p className="text-xs text-emerald-400 font-medium">{successLabel}</p>
      )}
    </>
  );
}
