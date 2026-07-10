/**
 * Inline add form for glossary terms (source → target).
 */

import { ArrowRight, Plus, X } from 'lucide-react';
import { Input } from '@/ui/Input';
import { Button } from '@/ui/Button';

export interface DictionaryAddFormProps {
  source: string;
  target: string;
  error?: string;
  onSourceChange: (v: string) => void;
  onTargetChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function DictionaryAddForm({
  source,
  target,
  error,
  onSourceChange,
  onTargetChange,
  onSubmit,
  onCancel,
}: DictionaryAddFormProps) {
  const canSubmit = Boolean(source.trim() && target.trim());

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="space-y-2 animate-fade-in-up">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[8rem]">
          <Input
            id="dict-source"
            type="text"
            placeholder="Source term"
            aria-label="Source term"
            value={source}
            onChange={(e) => onSourceChange(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
            className={error ? 'border-red-500/50' : undefined}
          />
        </div>
        <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0 hidden sm:block" aria-hidden />
        <div className="flex-1 min-w-[8rem]">
          <Input
            id="dict-target"
            type="text"
            placeholder="Preferred translation"
            aria-label="Preferred translation"
            value={target}
            onChange={(e) => onTargetChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <Button
          id="dict-add-btn"
          onClick={onSubmit}
          disabled={!canSubmit}
          icon={<Plus className="w-4 h-4" />}
        >
          Add
        </Button>
        <Button variant="ghost" onClick={onCancel} icon={<X className="w-4 h-4" />}>
          Cancel
        </Button>
      </div>
      {error && (
        <p className="text-xs text-rose-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
