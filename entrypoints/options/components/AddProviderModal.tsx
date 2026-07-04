/**
 * Modal listing catalog entries to add as a new provider (FR-7 rebuild).
 *
 * Rebuilt from the flat list-as-`message` version into a search + grouped
 * layout: a search input reusing `filterCatalog` (same logic as the inline
 * picker), Cloud / Local / Custom dividers via `groupByCategory`, and the
 * FR-2 identity badge on each row.
 */

import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Modal } from '@/ui/Modal';
import { Input } from '@/ui/Input';
import {
  filterCatalog,
  groupByCategory,
  type CatalogCategory,
  type OpenAiCompatibleCatalogEntry,
  type ProviderAccent,
} from '@/lib/openAiCompatibleCatalog';
import { ProviderIdentityBadge } from './ProviderIdentityBadge';

const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  cloud: 'Cloud',
  local: 'Local',
  custom: 'Custom',
};

/**
 * Resolve the badge accent/monogram for a catalog entry. Entries always
 * declare accent + monogram today; the defaults here make the modal robust
 * to a future entry that omits them (mirrors `resolveProviderIdentity`'s
 * fallback without re-running URL inference — the entry IS the source).
 */
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

interface AddProviderModalProps {
  onPick: (catalogId: string) => void;
  onClose: () => void;
}

export function AddProviderModal({ onPick, onClose }: AddProviderModalProps) {
  const [query, setQuery] = useState('');
  // groupByCategory respects filtered input and omits empty groups.
  const groups = useMemo(() => groupByCategory(filterCatalog(query)), [query]);

  const body = (
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
                    onClick={() => onPick(entry.id)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-zinc-700/60 hover:bg-zinc-800/50 hover:border-zinc-600 transition-colors text-left"
                  >
                    <ProviderIdentityBadge accent={identity.accent} monogram={identity.monogram} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-200 truncate">{entry.displayName}</p>
                      <p className="text-xs text-zinc-500 font-mono truncate">{entry.baseUrl}</p>
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
  );

  return (
    <Modal
      title="Add provider from catalog"
      message={body}
      confirmLabel="Done"
      cancelLabel="Cancel"
      onConfirm={onClose}
      onCancel={onClose}
    />
  );
}
