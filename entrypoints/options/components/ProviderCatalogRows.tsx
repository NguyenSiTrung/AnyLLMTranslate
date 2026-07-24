/**
 * Searchable, filterable, grouped provider catalog list with identity badges.
 * Shared by SetupWizard Connect and GuidedAddProvider choose step.
 */
import { Search } from 'lucide-react';
import {
  filterCatalog,
  groupByCategory,
  type CatalogCategory,
  type OpenAiCompatibleCatalogEntry,
  type ProviderAccent,
} from '@/lib/openAiCompatibleCatalog';
import type { CatalogFilterId } from '@/lib/setupWizard';
import { Input } from '@/ui/Input';
import { ProviderIdentityBadge } from './ProviderIdentityBadge';

const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  cloud: 'Cloud',
  local: 'Local',
  custom: 'Custom',
};

const FILTERS: { id: CatalogFilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'local', label: 'Local' },
  { id: 'custom', label: 'Custom' },
];

export function resolveIdentityForEntry(entry: OpenAiCompatibleCatalogEntry): {
  accent: ProviderAccent;
  monogram: string;
} {
  const trimmed = entry.displayName.trim();
  return {
    accent: entry.accent ?? 'zinc',
    monogram: entry.monogram ?? (trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : '?'),
  };
}

export interface ProviderCatalogRowsProps {
  query: string;
  onQueryChange: (q: string) => void;
  filter: CatalogFilterId;
  onFilterChange: (f: CatalogFilterId) => void;
  selectedCatalogId?: string | null;
  onSelect: (entry: OpenAiCompatibleCatalogEntry) => void;
  showFilters?: boolean;
  maxListClassName?: string;
  /** cyan = setup wizard brand; neutral = guided add default hover */
  activeTone?: 'cyan' | 'neutral';
}

export function ProviderCatalogRows({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  selectedCatalogId,
  onSelect,
  showFilters = true,
  maxListClassName = 'max-h-80',
  activeTone = 'neutral',
}: ProviderCatalogRowsProps) {
  const filtered = filterCatalog(query);
  const byFilter =
    filter === 'all'
      ? filtered
      : filtered.filter((e) => (e.category ?? 'cloud') === filter);
  const groups = groupByCategory(byFilter);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search OpenRouter, Groq, Ollama..."
          className="pl-9"
          aria-label="Search provider catalog"
        />
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Provider category filter">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={active}
                onClick={() => onFilterChange(f.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-cyan-500 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      )}

      <div className={`${maxListClassName} overflow-y-auto space-y-3`}>
        {groups.length === 0 && (
          <p className="p-3 text-xs text-zinc-500">No providers match your search.</p>
        )}
        {groups.map((group) => (
          <div key={group.category}>
            <p className="text-[10px] uppercase tracking-widest text-zinc-600 px-1 mb-1.5">
              {CATEGORY_LABELS[group.category]}
            </p>
            <div
              className="space-y-1.5"
              role="listbox"
              aria-label={`${CATEGORY_LABELS[group.category]} providers`}
            >
              {group.entries.map((entry) => {
                const identity = resolveIdentityForEntry(entry);
                const isActive = entry.id === selectedCatalogId;
                const activeClass =
                  activeTone === 'cyan'
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100'
                    : 'border-zinc-600 bg-zinc-800/50 text-zinc-100';
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => onSelect(entry)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors text-left cursor-pointer ${
                      isActive
                        ? activeClass
                        : 'border-zinc-700/60 hover:bg-zinc-800/50 hover:border-zinc-600 text-zinc-200'
                    }`}
                  >
                    <ProviderIdentityBadge
                      accent={identity.accent}
                      monogram={identity.monogram}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{entry.displayName}</p>
                      <p className="text-xs text-zinc-500 font-mono truncate">
                        {entry.baseUrl || 'Custom base URL'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
