/**
 * Step-by-step connection test progress (ping → models → translation).
 */

import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { ConnectionTestStep } from '@/services/providerTester';

const STEP_ORDER: ConnectionTestStep['name'][] = ['ping', 'models', 'translation'];

const STEP_LABELS: Record<ConnectionTestStep['name'], string> = {
  ping: 'Reachability',
  models: 'Model listing',
  translation: 'Translation',
};

interface ConnectionTestProgressListProps {
  steps: ConnectionTestStep[];
  isTesting: boolean;
}

export function ConnectionTestProgressList({ steps, isTesting }: ConnectionTestProgressListProps) {
  if (!isTesting && steps.length === 0) return null;

  return (
    <div className="space-y-2" aria-live="polite" aria-busy={isTesting}>
      {STEP_ORDER.map((name, index) => {
        const completed = steps.find((step) => step.name === name);
        const isRunning = isTesting && !completed && steps.length === index;

        if (!completed && !isRunning) return null;

        return (
          <div key={name} className="flex items-center gap-2 text-sm">
            {completed ? (
              completed.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              )
            ) : (
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
            )}
            <span className="text-zinc-300">{STEP_LABELS[name]}</span>
            {completed && (
              <span className="ml-auto text-xs text-zinc-500">{completed.latencyMs}ms</span>
            )}
            {isRunning && (
              <span className="ml-auto text-xs text-zinc-500">Running...</span>
            )}
          </div>
        );
      })}
    </div>
  );
}