/**
 * Modal listing catalog entries to add as a new provider (FR-1 extraction).
 *
 * Mechanical move from `ProvidersSection.tsx`. Full search + category
 * rebuild happens in Phase 4 (FR-7).
 */

import { Plus } from 'lucide-react';
import { Modal } from '@/ui/Modal';
import { OPENAI_COMPATIBLE_CATALOG } from '@/lib/openAiCompatibleCatalog';

interface AddProviderModalProps {
  onPick: (catalogId: string) => void;
  onClose: () => void;
}

export function AddProviderModal({ onPick, onClose }: AddProviderModalProps) {
  // The catalog list is rendered as the Modal's `message` body.
  const catalogBody = (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {OPENAI_COMPATIBLE_CATALOG.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => onPick(entry.id)}
          className="w-full flex items-center justify-between p-3 rounded-lg border border-zinc-700/60 hover:bg-zinc-800/50 transition-colors text-left"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-200 truncate">{entry.displayName}</p>
            <p className="text-xs text-zinc-500 font-mono truncate">{entry.baseUrl}</p>
          </div>
          <Plus className="w-4 h-4 text-zinc-500 shrink-0" />
        </button>
      ))}
    </div>
  );
  return (
    <Modal
      title="Add provider from catalog"
      message={catalogBody}
      confirmLabel="Done"
      cancelLabel="Cancel"
      onConfirm={onClose}
      onCancel={onClose}
    />
  );
}
