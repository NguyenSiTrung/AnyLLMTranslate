/**
 * Connect step: choose provider from catalog, then enter credentials.
 */
import type { OpenAiCompatibleCatalogEntry } from '@/lib/openAiCompatibleCatalog';
import { getCatalogEntryById } from '@/lib/openAiCompatibleCatalog';
import type { CatalogFilterId } from '@/lib/setupWizard';
import type { ProviderConfig } from '@/types/config';
import type { RecoveryMessage } from '@/lib/providerReadiness';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Button } from '@/ui/Button';
import { ModelPicker } from '../../ModelPicker';
import {
  ProviderCatalogRows,
  resolveIdentityForEntry,
} from '../../ProviderCatalogRows';
import { ProviderIdentityBadge } from '../../ProviderIdentityBadge';

export type ConnectPhase = 'choose' | 'credentials';

export interface ConnectStepProps {
  phase: ConnectPhase;
  onPhaseChange: (p: ConnectPhase) => void;
  catalogFilter: CatalogFilterId;
  onCatalogFilterChange: (f: CatalogFilterId) => void;
  catalogQuery: string;
  onCatalogQueryChange: (q: string) => void;
  catalogId: string;
  provider: ProviderConfig;
  canContinueToTest: boolean;
  recovery: RecoveryMessage;
  apiKeyPlaceholder: string;
  onSelectCatalogEntry: (entry: OpenAiCompatibleCatalogEntry) => void;
  onProviderPatch: (patch: Partial<ProviderConfig>) => void;
}

export function ConnectStep({
  phase,
  onPhaseChange,
  catalogFilter,
  onCatalogFilterChange,
  catalogQuery,
  onCatalogQueryChange,
  catalogId,
  provider,
  canContinueToTest,
  recovery,
  apiKeyPlaceholder,
  onSelectCatalogEntry,
  onProviderPatch,
}: ConnectStepProps) {
  if (phase === 'choose') {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">
            Choose where translations run
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            Search a known host to auto-fill the base URL, then add your key and model.
          </p>
        </div>
        <ProviderCatalogRows
          query={catalogQuery}
          onQueryChange={onCatalogQueryChange}
          filter={catalogFilter}
          onFilterChange={onCatalogFilterChange}
          selectedCatalogId={catalogId}
          onSelect={(entry) => {
            onSelectCatalogEntry(entry);
            onPhaseChange('credentials');
          }}
          showFilters
          maxListClassName="max-h-40 sm:max-h-56"
          activeTone="cyan"
        />
      </div>
    );
  }

  const catalogEntry = getCatalogEntryById(catalogId);
  const identity = catalogEntry
    ? resolveIdentityForEntry(catalogEntry)
    : {
        accent: 'zinc' as const,
        monogram: (provider.displayName?.trim().charAt(0) || '?').toUpperCase(),
      };
  const displayName =
    provider.displayName?.trim() || catalogEntry?.displayName || 'Custom endpoint';
  const shouldOpenUrl = !provider.baseUrl.trim() || catalogId === 'custom';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ProviderIdentityBadge accent={identity.accent} monogram={identity.monogram} />
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-zinc-100">{displayName}</h3>
            <p className="text-xs text-zinc-500">Add credentials to continue</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onPhaseChange('choose')}>
          Change
        </Button>
      </div>

      <div className="space-y-4 min-w-0">
        <FieldGroup
          label="API Key"
          htmlFor="setup-api-key"
          description={
            provider.requiresApiKey
              ? 'Required for this provider.'
              : 'Optional — leave blank for local providers.'
          }
        >
          <Input
            id="setup-api-key"
            type="password"
            value={provider.apiKey}
            onChange={(e) =>
              onProviderPatch({
                apiKey: e.target.value,
                connectionStatus: 'unknown',
              })
            }
            placeholder={apiKeyPlaceholder}
            className="font-mono"
          />
        </FieldGroup>

        <ModelPicker
          inputId="setup-model"
          provider={provider}
          onModelChange={(model) =>
            onProviderPatch({ model, connectionStatus: 'unknown' })
          }
        />

        <details
          className="group rounded-lg border border-zinc-800 bg-zinc-900/40"
          open={shouldOpenUrl}
        >
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-zinc-400">
            Advanced · Base URL
          </summary>
          <div className="px-3 pb-3">
            <FieldGroup label="Base URL" htmlFor="setup-base-url">
              <Input
                id="setup-base-url"
                value={provider.baseUrl}
                onChange={(e) =>
                  onProviderPatch({
                    baseUrl: e.target.value,
                    connectionStatus: 'unknown',
                  })
                }
                placeholder="https://api.example.com/v1"
                className="font-mono"
              />
            </FieldGroup>
          </div>
        </details>

        {!canContinueToTest && (
          <div
            className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5"
            role="status"
          >
            <p className="text-sm font-medium text-amber-200">{recovery.title}</p>
            <p className="mt-0.5 text-xs text-amber-100/75">{recovery.action}</p>
          </div>
        )}
      </div>
    </div>
  );
}
