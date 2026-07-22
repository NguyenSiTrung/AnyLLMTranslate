/**
 * Three-step guided add-provider flow: Choose → Connect → Verify.
 */

import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  filterCatalog,
  getCatalogEntryById,
  groupByCategory,
  type CatalogCategory,
  type OpenAiCompatibleCatalogEntry,
  type ProviderAccent,
} from '@/lib/openAiCompatibleCatalog';
import { buildProviderConfig } from '@/lib/providerPoolHelpers';
import { testConnection } from '@/services/providerTester';
import { Modal } from '@/ui/Modal';
import { Input } from '@/ui/Input';
import { Button } from '@/ui/Button';
import { FieldGroup } from '@/ui/FieldGroup';
import { ModelPicker } from './ModelPicker';
import { ProviderIdentityBadge } from './ProviderIdentityBadge';
import { ConnectionTestProgressList } from './ConnectionTestProgressList';
import type { ConnectionTestStep } from '@/services/providerTester';

const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  cloud: 'Cloud',
  local: 'Local',
  custom: 'Custom',
};

function resolveIdentityForEntry(entry: OpenAiCompatibleCatalogEntry): {
  accent: ProviderAccent;
  monogram: string;
} {
  const trimmed = entry.displayName.trim();
  return {
    accent: entry.accent ?? 'zinc',
    monogram: entry.monogram ?? (trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : '?'),
  };
}

interface GuidedAddProviderProps {
  targetLanguage: string;
  onComplete: (providerId: string) => void;
  onClose: () => void;
  addProviderFromCatalog: (
    catalogId: string,
    overrides?: {
      displayName?: string;
      baseUrl?: string;
      model?: string;
      requiresApiKey?: boolean;
      apiKey?: string;
    },
  ) => string;
}

type Step = 'choose' | 'connect' | 'verify';

export function GuidedAddProvider({
  targetLanguage,
  onComplete,
  onClose,
  addProviderFromCatalog,
}: GuidedAddProviderProps) {
  const [step, setStep] = useState<Step>('choose');
  const [query, setQuery] = useState('');
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [requiresApiKey, setRequiresApiKey] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [testProgress, setTestProgress] = useState<ConnectionTestStep[]>([]);
  const [testError, setTestError] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);

  const groups = useMemo(() => groupByCategory(filterCatalog(query)), [query]);

  const pickEntry = (entry: OpenAiCompatibleCatalogEntry) => {
    setCatalogId(entry.id);
    setDisplayName(entry.displayName);
    setBaseUrl(entry.baseUrl);
    setModel(entry.defaultModel ?? '');
    setRequiresApiKey(entry.requiresApiKey);
    setStep('connect');
  };

  const commitProvider = () => {
    if (!catalogId) return;
    const id = addProviderFromCatalog(catalogId, {
      displayName,
      baseUrl,
      model,
      requiresApiKey,
      apiKey,
    });
    onComplete(id);
  };

  const runVerify = async () => {
    setIsTesting(true);
    setTestProgress([]);
    setTestError(null);
    setTestOk(false);
    try {
      const result = await testConnection(
        buildProviderConfig(
          {
            id: 'tmp',
            displayName,
            baseUrl,
            model,
            requiresApiKey,
            temperature: 0.3,
            maxTokens: 4096,
            enabled: true,
            keys: [],
          },
          {
            id: 'tmp-key',
            apiKey,
            maxRpm: 0,
            concurrencyLimit: 0,
            interval: 0,
            enabled: true,
          },
        ),
        (stepResult) => setTestProgress((prev) => [...prev, stepResult]),
        targetLanguage,
      );
      if (result.overall) {
        setTestOk(true);
        // auto-commit on success after brief moment
        if (!catalogId) {
          setTestOk(false);
          return;
        }
        const id = addProviderFromCatalog(catalogId, {
          displayName,
          baseUrl,
          model,
          requiresApiKey,
          apiKey,
        });
        onComplete(id);
      } else {
        setTestError(
          result.steps.find((s) => !s.success)?.error ?? 'Connection test failed',
        );
      }
    } catch {
      setTestError('Connection test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const stepLabel =
    step === 'choose' ? '1 · Choose' : step === 'connect' ? '2 · Connect' : '3 · Verify';

  const body = (
    <div className="space-y-4">
      <p className="text-[11px] uppercase tracking-widest text-zinc-600">{stepLabel}</p>

      {step === 'choose' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search OpenRouter, Groq, Ollama..."
              className="pl-9"
              aria-label="Search provider catalog"
            />
          </div>
          <div className="max-h-80 overflow-y-auto space-y-3">
            {groups.length === 0 && (
              <p className="p-3 text-xs text-zinc-500">No providers match your search.</p>
            )}
            {groups.map((group) => (
              <div key={group.category}>
                <p className="text-[10px] uppercase tracking-widest text-zinc-600 px-1 mb-1.5">
                  {CATEGORY_LABELS[group.category]}
                </p>
                <div className="space-y-1.5">
                  {group.entries.map((entry) => {
                    const identity = resolveIdentityForEntry(entry);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => pickEntry(entry)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-zinc-700/60 hover:bg-zinc-800/50 hover:border-zinc-600 transition-colors text-left"
                      >
                        <ProviderIdentityBadge
                          accent={identity.accent}
                          monogram={identity.monogram}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-zinc-200 truncate">
                            {entry.displayName}
                          </p>
                          <p className="text-xs text-zinc-500 font-mono truncate">
                            {entry.baseUrl || 'Custom base URL'}
                          </p>
                        </div>
                        <Plus className="w-4 h-4 text-zinc-500 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 'connect' && (
        <div className="space-y-3">
          <FieldGroup label="Display name" htmlFor="guided-name">
            <Input
              id="guided-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Base URL" htmlFor="guided-url">
            <Input
              id="guided-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="font-mono"
            />
          </FieldGroup>
          <FieldGroup
            label="API key"
            htmlFor="guided-key"
            description={
              requiresApiKey
                ? 'Required for this provider.'
                : 'Optional — leave blank for local or unauthenticated endpoints.'
            }
          >
            <Input
              id="guided-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="font-mono"
              placeholder={
                getCatalogEntryById(catalogId ?? '')?.placeholder ?? 'sk-...'
              }
            />
          </FieldGroup>
          <ModelPicker
            inputId="guided-model"
            provider={{
              preset: 'custom',
              baseUrl,
              apiKey,
              model,
              temperature: 0.3,
              maxTokens: 4096,
              displayName,
              requiresApiKey,
              requestTimeoutMs: 60000,
              maxRpm: 0,
            }}
            onModelChange={setModel}
          />
          <div className="flex justify-between gap-2 pt-2">
            <Button size="sm" variant="ghost" onClick={() => setStep('choose')}>
              Back
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!baseUrl.trim() || !model.trim() || (requiresApiKey && !apiKey.trim())}
              onClick={() => setStep('verify')}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 'verify' && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">
            Validate reachability, model listing, and a sample translation for{' '}
            <span className="text-zinc-200 font-medium">{displayName}</span>.
          </p>
          <ConnectionTestProgressList steps={testProgress} isTesting={isTesting} />
          {testError && (
            <p className="text-xs text-rose-400" role="alert">
              {testError}
            </p>
          )}
          {testOk && (
            <p className="text-xs text-emerald-400">Connection successful.</p>
          )}
          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <Button size="sm" variant="ghost" onClick={() => setStep('connect')}>
              Back
            </Button>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={commitProvider}>
                Skip verify
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={isTesting}
                onClick={runVerify}
              >
                {isTesting ? 'Testing…' : testError ? 'Retry' : 'Verify & add'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Modal
      title="Add provider"
      message={body}
      confirmLabel="Close"
      cancelLabel="Cancel"
      onConfirm={onClose}
      onCancel={onClose}
    />
  );
}
