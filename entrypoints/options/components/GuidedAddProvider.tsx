/**
 * Three-step guided add-provider flow: Choose → Connect → Verify.
 */

import { useState } from 'react';
import { getCatalogEntryById, type OpenAiCompatibleCatalogEntry } from '@/lib/openAiCompatibleCatalog';
import type { CatalogFilterId } from '@/lib/setupWizard';
import { buildProviderConfig } from '@/lib/providerPoolHelpers';
import { testConnection } from '@/services/providerTester';
import { Modal } from '@/ui/Modal';
import { Input } from '@/ui/Input';
import { Button } from '@/ui/Button';
import { FieldGroup } from '@/ui/FieldGroup';
import { ModelPicker } from './ModelPicker';
import { ConnectionTestProgressList } from './ConnectionTestProgressList';
import { ProviderCatalogRows } from './ProviderCatalogRows';
import type { ConnectionTestStep } from '@/services/providerTester';

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
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilterId>('all');
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
        <ProviderCatalogRows
          query={query}
          onQueryChange={setQuery}
          filter={catalogFilter}
          onFilterChange={setCatalogFilter}
          selectedCatalogId={catalogId}
          onSelect={pickEntry}
          showFilters
          activeTone="neutral"
        />
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
