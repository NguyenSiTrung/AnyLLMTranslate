/**
 * Ready / success body after setup completes.
 */
import { CheckCircle2, KeyRound, Languages } from 'lucide-react';

export interface ReadyStepProps {
  providerDisplayName?: string;
  targetLanguageLabel: string;
}

export function ReadyStep({ providerDisplayName, targetLanguageLabel }: ReadyStepProps) {
  return (
    <div className="space-y-5 py-2 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15">
        <CheckCircle2 className="h-9 w-9 text-emerald-400" />
      </div>
      <div>
        <h3 className="text-xl font-semibold text-zinc-100">You&apos;re ready to translate</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
          Provider connected
          {providerDisplayName ? ` (${providerDisplayName})` : ''}
          {' · '}
          target {targetLanguageLabel}.
        </p>
      </div>
      <div className="mx-auto flex max-w-sm flex-wrap justify-center gap-2">
        {providerDisplayName && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-300">
            <KeyRound className="h-3 w-3 text-cyan-400" />
            {providerDisplayName}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-300">
          <Languages className="h-3 w-3 text-sky-400" />
          {targetLanguageLabel}
        </span>
      </div>
      <p className="text-xs text-zinc-500">
        Manage providers anytime in the Providers tab · change language in General settings
      </p>
    </div>
  );
}
