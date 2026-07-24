/**
 * Shared connection-test result block (FR-1 dedup).
 *
 * Renders the success line, thinking/reasoning probe line, and the failure card.
 * Kept presentational — error-message resolution is the caller's job.
 */

import type { ConnectionTestResult } from '@/services/providerTester';
import type { ThinkingProbeResult } from '@/lib/thinkingDetection';

interface ProviderTestResultProps {
  testResult: ConnectionTestResult | null;
  /** Title shown in the failure card (already localized/classified). */
  failureTitle: string;
  /** Action shown under the failure title. */
  failureAction: string;
  /** Label shown on success, e.g. "Connection successful." */
  successLabel: string;
}

function thinkingLineClass(thinking: ThinkingProbeResult): string {
  switch (thinking.verdict) {
    case 'disable-success':
      return 'text-emerald-400/90';
    case 'disable-failed':
      return 'text-amber-300';
    case 'controls-rejected':
      return 'text-amber-300/90';
    default:
      return 'text-zinc-400';
  }
}

export function ProviderTestResult({
  testResult,
  failureTitle,
  failureAction,
  successLabel,
}: ProviderTestResultProps) {
  const thinking = testResult?.thinking;

  return (
    <>
      {testResult && !testResult.overall && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
          <p className="text-xs font-medium text-red-300">{failureTitle}</p>
          <p className="text-xs text-red-200/80 mt-1">{failureAction}</p>
        </div>
      )}
      {testResult?.overall && (
        <div className="space-y-1">
          <p className="text-xs text-emerald-400 font-medium">{successLabel}</p>
          {thinking && (
            <p className={`text-xs ${thinkingLineClass(thinking)}`}>{thinking.summary}</p>
          )}
        </div>
      )}
      {/* Show thinking probe even when overall failed but translation still produced a probe */}
      {testResult && !testResult.overall && thinking && (
        <p className={`text-xs mt-1 ${thinkingLineClass(thinking)}`}>{thinking.summary}</p>
      )}
    </>
  );
}
