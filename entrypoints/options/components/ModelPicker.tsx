/**
 * Model field with optional Browse models (GET /models, paginated) without full connection test.
 * Shows a searchable scrollable list of all returned model ids (no hard 24-chip cap).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, List, Search } from 'lucide-react';
import { getCatalogEntryById } from '@/lib/openAiCompatibleCatalog';
import { filterModelIds } from '@/lib/modelListing';
import { inferCatalogId } from './ProviderCatalogPicker';
import type { ProviderConfig } from '@/types/config';
import { listProviderModels } from '@/services/providerTester';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Button } from '@/ui/Button';

interface ModelPickerProps {
  provider: ProviderConfig;
  onModelChange: (model: string) => void;
  inputId?: string;
  /** Extra model chips from connection test */
  testModels?: string[];
}

function canBrowseModels(provider: ProviderConfig): boolean {
  if (!provider.baseUrl.trim()) return false;
  if (provider.requiresApiKey && !provider.apiKey.trim()) return false;
  const catalogId = inferCatalogId(provider.baseUrl);
  const entry = getCatalogEntryById(catalogId);
  return entry?.supportsModelListing !== false;
}

export function ModelPicker({
  provider,
  onModelChange,
  inputId = 'provider-model',
  testModels = [],
}: ModelPickerProps) {
  const [browseModels, setBrowseModels] = useState<string[]>([]);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [query, setQuery] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Clear browse results when endpoint identity changes so stale lists never show.
  useEffect(() => {
    setBrowseModels([]);
    setBrowseError(null);
    setQuery('');
  }, [provider.baseUrl, provider.apiKey]);

  const handleBrowse = useCallback(async () => {
    setIsBrowsing(true);
    setBrowseError(null);
    setQuery('');
    const result = await listProviderModels({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
    });
    if (!mountedRef.current) return;
    setIsBrowsing(false);
    if (!result.success) {
      setBrowseModels([]);
      setBrowseError(result.error ?? 'Failed to list models');
      return;
    }
    setBrowseModels(result.models);
  }, [provider.baseUrl, provider.apiKey]);

  const allModels = useMemo(
    () => [...new Set([...browseModels, ...testModels])],
    [browseModels, testModels],
  );
  const filteredModels = useMemo(
    () => filterModelIds(allModels, query),
    [allModels, query],
  );
  const browseEnabled = canBrowseModels(provider);
  const showList = allModels.length > 0;

  return (
    <FieldGroup
      label="Model"
      description="The model ID to use for translations."
      htmlFor={inputId}
    >
      <div className="flex gap-2">
        <Input
          id={inputId}
          type="text"
          value={provider.model}
          onChange={(e) => onModelChange(e.target.value)}
          placeholder="model-name"
          className="font-mono flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!browseEnabled || isBrowsing}
          onClick={handleBrowse}
          icon={isBrowsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <List className="w-4 h-4" />}
        >
          {isBrowsing ? 'Loading...' : 'Browse models'}
        </Button>
      </div>
      {browseError && (
        <p className="text-xs text-red-400 mt-2" role="alert">
          {browseError}
        </p>
      )}
      {showList && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              {query.trim()
                ? `${filteredModels.length} of ${allModels.length} models`
                : `${allModels.length} model${allModels.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models..."
              className="pl-9 font-mono"
              aria-label="Search models"
            />
          </div>
          <div
            className="max-h-48 overflow-y-auto overflow-x-hidden rounded-lg border border-zinc-800 divide-y divide-zinc-800/80"
            role="listbox"
            aria-label="Available models"
          >
            {filteredModels.length === 0 ? (
              <p className="p-3 text-xs text-zinc-500">No models match your search.</p>
            ) : (
              filteredModels.map((m) => {
                const isActive = provider.model === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => onModelChange(m)}
                    className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors cursor-pointer break-all ${
                      isActive
                        ? 'bg-blue-500/10 text-blue-300'
                        : 'bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800/80'
                    }`}
                  >
                    {m}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </FieldGroup>
  );
}
