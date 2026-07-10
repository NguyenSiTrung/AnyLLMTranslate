/**
 * Glossary term list — filter, mismatch sort, footer counts.
 */

import { useMemo } from 'react';
import type { GlossaryEntry } from '@/types/config';
import { filterGlossaryEntries, sortMismatchesFirst } from '@/lib/glossary';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { GlossaryEntryRow } from './GlossaryEntryRow';

export interface GlossaryEntryListProps {
  entries: GlossaryEntry[];
  searchQuery: string;
  mismatchedIds: ReadonlySet<string>;
  editingId: string | null;
  editSource: string;
  editTarget: string;
  editError?: string;
  onEditSourceChange: (v: string) => void;
  onEditTargetChange: (v: string) => void;
  onStartEdit: (entry: GlossaryEntry) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onRequestDelete: (id: string) => void;
  onClearSearch: () => void;
}

export function GlossaryEntryList({
  entries,
  searchQuery,
  mismatchedIds,
  editingId,
  editSource,
  editTarget,
  editError,
  onEditSourceChange,
  onEditTargetChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onRequestDelete,
  onClearSearch,
}: GlossaryEntryListProps) {
  const filtered = useMemo(
    () => filterGlossaryEntries(entries, searchQuery),
    [entries, searchQuery],
  );
  const ordered = useMemo(
    () => sortMismatchesFirst(filtered, mismatchedIds),
    [filtered, mismatchedIds],
  );

  const q = searchQuery.trim();
  const footer =
    q.length > 0
      ? `Showing ${filtered.length} of ${entries.length} ${entries.length === 1 ? 'term' : 'terms'}`
      : `${entries.length} ${entries.length === 1 ? 'term' : 'terms'}`;

  return (
    <Card variant="bordered" className="p-0 overflow-hidden">
      {q && filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
          <p className="text-sm text-zinc-500 mb-3">No terms match “{q}”</p>
          <Button variant="secondary" size="sm" onClick={onClearSearch}>
            Clear search
          </Button>
        </div>
      ) : (
        <ul role="list" className="divide-y divide-zinc-800" aria-label="Custom terms">
          {ordered.map((entry) => (
            <li
              key={entry.id}
              role="listitem"
              aria-label={`${entry.source} translates to ${entry.target}`}
            >
              <GlossaryEntryRow
                entry={entry}
                isEditing={editingId === entry.id}
                isMismatched={mismatchedIds.has(entry.id)}
                editSource={editSource}
                editTarget={editTarget}
                editError={editingId === entry.id ? editError : undefined}
                onEditSourceChange={onEditSourceChange}
                onEditTargetChange={onEditTargetChange}
                onStartEdit={() => onStartEdit(entry)}
                onSaveEdit={() => onSaveEdit(entry.id)}
                onCancelEdit={onCancelEdit}
                onRequestDelete={() => onRequestDelete(entry.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="px-4 py-2.5 bg-zinc-900/60 text-xs text-zinc-500 border-t border-zinc-800">
        {footer}
      </div>
    </Card>
  );
}
