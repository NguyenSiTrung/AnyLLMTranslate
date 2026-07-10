/**
 * Single glossary term row — view and inline edit modes.
 */

import { AlertTriangle, ArrowRight, Check, PenLine, Trash2, X } from 'lucide-react';
import type { GlossaryEntry } from '@/types/config';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';

const MISMATCH_TIP =
  'This preferred translation was not found in the preview output. Try a clearer sample sentence or adjust the term.';

export interface GlossaryEntryRowProps {
  entry: GlossaryEntry;
  isEditing: boolean;
  isMismatched: boolean;
  editSource: string;
  editTarget: string;
  onEditSourceChange: (v: string) => void;
  onEditTargetChange: (v: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRequestDelete: () => void;
  editError?: string;
}

export function GlossaryEntryRow({
  entry,
  isEditing,
  isMismatched,
  editSource,
  editTarget,
  onEditSourceChange,
  onEditTargetChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onRequestDelete,
  editError,
}: GlossaryEntryRowProps) {
  if (isEditing) {
    const canSave = Boolean(editSource.trim() && editTarget.trim());
    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (canSave) onSaveEdit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancelEdit();
      }
    };

    return (
      <div className="px-4 py-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[7rem]">
            <Input
              type="text"
              value={editSource}
              onChange={(e) => onEditSourceChange(e.target.value)}
              onKeyDown={onKeyDown}
              autoFocus
              aria-label="Edit source term"
              className={editError ? 'border-red-500/50' : undefined}
            />
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" aria-hidden />
          <div className="flex-1 min-w-[7rem]">
            <Input
              type="text"
              value={editTarget}
              onChange={(e) => onEditTargetChange(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Edit translation"
            />
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="primary"
              size="sm"
              onClick={onSaveEdit}
              disabled={!canSave}
              icon={<Check className="w-3.5 h-3.5" />}
              aria-label="Save edit"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancelEdit}
              icon={<X className="w-3.5 h-3.5" />}
              aria-label="Cancel edit"
            />
          </div>
        </div>
        {editError && (
          <p className="text-xs text-rose-400" role="alert">
            {editError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="group flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-800/40 transition-colors"
      aria-label={`${entry.source} translates to ${entry.target}`}
    >
      <button
        type="button"
        className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
        onClick={onStartEdit}
      >
        {isMismatched && (
          <span className="flex items-center gap-1 shrink-0" title={MISMATCH_TIP}>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" aria-hidden />
            <Badge variant="warning">Not honoured</Badge>
          </span>
        )}
        <span className="text-sm text-zinc-100 truncate">{entry.source}</span>
        <ArrowRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" aria-hidden />
        <span className="text-sm text-zinc-300 truncate">{entry.target}</span>
      </button>
      <div className="flex items-center gap-0.5 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          onClick={onStartEdit}
          icon={<PenLine className="w-3.5 h-3.5" />}
          aria-label={`Edit ${entry.source}`}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={onRequestDelete}
          icon={<Trash2 className="w-3.5 h-3.5" />}
          aria-label={`Delete ${entry.source}`}
          className="hover:text-rose-400"
        />
      </div>
    </div>
  );
}
