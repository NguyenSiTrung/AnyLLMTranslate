import { useState } from 'react';
import type { NamedGlossarySuggestionRow } from '@/lib/namedGlossarySuggestions';

interface EditableRow extends NamedGlossarySuggestionRow {
  selected: boolean;
}

export function NamedGlossarySuggestionsModal({
  rows,
  activeListName,
  onClose,
  onPush,
}: {
  rows: NamedGlossarySuggestionRow[];
  activeListName: string | null;
  onClose: () => void;
  onPush: (rows: NamedGlossarySuggestionRow[]) => void;
}) {
  const [editableRows, setEditableRows] = useState<EditableRow[]>(
    rows.map((row) => ({ ...row, selected: true })),
  );
  const selectedRows = editableRows.filter((row) => row.selected && row.target.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="suggestions-title"
        className="w-full max-h-[520px] flex flex-col rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl"
      >
        <div className="p-4 border-b border-zinc-800">
          <h2 id="suggestions-title" className="text-sm font-semibold text-zinc-100">
            Review suggestions
          </h2>
          <p className="mt-1 text-[11px] text-zinc-400">
            {activeListName ? `Push selected names into ${activeListName}.` : 'Select or create a list first'}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {editableRows.length === 0 && (
            <p className="py-8 text-center text-xs text-zinc-500">No new suggestions yet.</p>
          )}
          {editableRows.map((row, index) => (
            <div key={`${row.source}-${index}`} className="rounded-xl bg-zinc-900 p-2.5">
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-200">
                <input
                  type="checkbox"
                  aria-label={`Select ${row.source}`}
                  checked={row.selected}
                  onChange={(event) =>
                    setEditableRows((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, selected: event.target.checked } : item,
                      ),
                    )
                  }
                />
                <span className="truncate">{row.source}</span>
              </label>
              <input
                aria-label={`Translation for ${row.source}`}
                value={row.target}
                onChange={(event) =>
                  setEditableRows((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, target: event.target.value } : item,
                    ),
                  )
                }
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-blue-500"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-800 p-3">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-zinc-300">
            Cancel
          </button>
          <button
            type="button"
            disabled={!activeListName || selectedRows.length === 0}
            onClick={() => onPush(selectedRows.map(({ source, target }) => ({ source, target })))}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Push selected
          </button>
        </div>
      </section>
    </div>
  );
}
