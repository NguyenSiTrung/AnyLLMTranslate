/**
 * Verify step: choose target language and prove the connection.
 */
import { CheckCircle2, Globe2, Loader2, Server, Shield, Zap } from 'lucide-react';
import type { Language } from '@/lib/languages';
import type { ConnectionTestResult, ConnectionTestStep } from '@/services/providerTester';
import { Button } from '@/ui/Button';
import { FieldGroup } from '@/ui/FieldGroup';
import { Select } from '@/ui/Select';
import { ConnectionTestProgressList } from '../../ConnectionTestProgressList';

export interface VerifyStepProps {
  providerLabel: string;
  modelLabel: string;
  selectedLanguage: string;
  onLanguageChange: (code: string) => void;
  popularLanguages: Language[];
  targetLanguageOptions: { value: string; label: string }[];
  isTesting: boolean;
  testResult: ConnectionTestResult | null;
  testProgress: ConnectionTestStep[];
  connectionStatus: string;
  onTest: () => void;
  failedMessage: { title: string; description: string; action: string };
}

export function VerifyStep({
  providerLabel,
  modelLabel,
  selectedLanguage,
  onLanguageChange,
  popularLanguages,
  targetLanguageOptions,
  isTesting,
  testResult,
  testProgress,
  connectionStatus,
  onTest,
  failedMessage,
}: VerifyStepProps) {
  const targetLangLabel =
    popularLanguages.find((l) => l.code === selectedLanguage)?.nativeName ??
    targetLanguageOptions.find((o) => o.value === selectedLanguage)?.label ??
    selectedLanguage;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">Prove the connection</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Choose your target language, then we ping the endpoint and run a tiny translation.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Target language
        </p>
        <div className="flex flex-wrap gap-1.5">
          {popularLanguages.map((lang) => {
            const active = selectedLanguage === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => onLanguageChange(lang.code)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-cyan-500 text-zinc-950 ring-2 ring-cyan-400/40'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
                aria-pressed={active}
              >
                {lang.nativeName}
              </button>
            );
          })}
        </div>
      </div>

      <FieldGroup
        label="All languages"
        htmlFor="setup-target-language"
        description="Full list of supported target languages."
      >
        <Select
          id="setup-target-language"
          aria-label="Target language"
          value={selectedLanguage}
          onChange={(e) => onLanguageChange(e.target.value)}
          options={targetLanguageOptions}
        />
      </FieldGroup>

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 text-xs text-zinc-300">
          <Server className="h-3 w-3 text-cyan-400" />
          {providerLabel}
        </span>
        <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 font-mono text-xs text-zinc-400">
          {modelLabel}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 text-xs text-zinc-300">
          <Globe2 className="h-3 w-3 text-sky-400" />→ {targetLangLabel}
        </span>
      </div>

      <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.01] p-4">
        <Button
          onClick={onTest}
          loading={isTesting}
          icon={!isTesting ? <Zap className="w-4 h-4" /> : undefined}
          className="bg-cyan-600 hover:bg-cyan-500 text-white disabled:bg-zinc-700 disabled:text-zinc-500"
        >
          {isTesting ? 'Testing…' : testResult ? 'Retry test' : 'Test connection'}
        </Button>
        <ConnectionTestProgressList steps={testProgress} isTesting={isTesting} />
        {isTesting && testProgress.length === 0 && (
          <p className="text-sm text-zinc-400">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Starting connection test…
          </p>
        )}
        {testResult?.overall && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div>
              <p className="text-sm font-medium text-emerald-300">Connection successful</p>
              <p className="mt-0.5 text-xs text-emerald-200/70">
                Your provider is ready. Finish setup when you are ready.
              </p>
            </div>
          </div>
        )}
        {!testResult && connectionStatus === 'success' && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/80" />
            <p className="text-sm text-emerald-200/90">
              Previously verified. You can continue, or re-run the test to confirm.
            </p>
          </div>
        )}
        {testResult && !testResult.overall && (
          <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 p-3">
            <p className="text-sm font-medium text-rose-300">{failedMessage.title}</p>
            <p className="mt-1 text-xs text-rose-200/80">{failedMessage.description}</p>
            <p className="mt-1.5 text-xs font-medium text-rose-200/90">
              Next: {failedMessage.action}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
