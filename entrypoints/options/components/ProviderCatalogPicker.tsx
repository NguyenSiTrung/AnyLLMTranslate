/**
 * Searchable picker for OpenAI-compatible provider catalog entries.
 */

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  OPENAI_COMPATIBLE_CATALOG,
  filterCatalog,
  type OpenAiCompatibleCatalogEntry,
} from '@/lib/openAiCompatibleCatalog';
import type { ProviderConfig } from '@/types/config';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';

export interface ProviderCatalogSelection {
  catalogId: string;
  patch: Partial<ProviderConfig>;
}

interface ProviderCatalogPickerProps {
  selectedCatalogId?: string;
  provider: Pick<ProviderConfig, 'baseUrl' | 'apiKey' | 'model'>;
  onSelect: (selection: ProviderCatalogSelection) => void;
}

export function inferCatalogId(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/$/, '');
  if (!normalized) return 'custom';
  const match = OPENAI_COMPATIBLE_CATALOG.find((e) => {
    const entryUrl = e.baseUrl.trim().replace(/\/$/, '');
    return entryUrl && entryUrl === normalized;
  });
  return match?.id ?? 'custom';
}

export function resolveCatalogSelection(
  entry: OpenAiCompatibleCatalogEntry,
  current: Pick<ProviderConfig, 'apiKey' | 'model'>,
): ProviderCatalogSelection {
  return {
    catalogId: entry.id,
    patch: {
      preset: 'custom',
      displayName: entry.displayName,
      baseUrl: entry.baseUrl,
      requiresApiKey: entry.requiresApiKey,
      model: current.model || entry.defaultModel || '',
      apiKey: current.apiKey,
      connectionStatus: 'unknown',
    },
  };
}

export function ProviderCatalogPicker({
  selectedCatalogId: selectedCatalogIdProp,
  provider,
  onSelect,
}: ProviderCatalogPickerProps) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filterCatalog(query), [query]);
  const selectedId = selectedCatalogIdProp ?? inferCatalogId(provider.baseUrl);

  return (
    <FieldGroup
      label="Provider template"
      description="Search a known OpenAI-compatible host to auto-fill the base URL."
    >
      <div className="relative mb-2">
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
      <div
        className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800 divide-y divide-zinc-800/80"
        role="listbox"
        aria-label="Provider catalog"
      >
        {filtered.length === 0 ? (
          <p className="p-3 text-xs text-zinc-500">No providers match your search.</p>
        ) : (
          filtered.map((entry) => {
            const isActive = entry.id === selectedId;
            return (
              <button
                key={entry.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => onSelect(resolveCatalogSelection(entry, provider))}
                className={`w-full text-left px-3 py-2.5 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-blue-500/10 text-blue-300'
                    : 'bg-zinc-900/50 text-zinc-200 hover:bg-zinc-800/80'
                }`}
              >
                <p className="text-sm font-medium">{entry.displayName}</p>
                <p className="text-xs text-zinc-500 truncate mt-0.5">
                  {entry.baseUrl || 'Enter your own base URL'}
                </p>
              </button>
            );
          })
        )}
      </div>
    </FieldGroup>
  );
}