/**
 * First-run empty state for Settings → Dictionary (glossary).
 */

import { BookOpen, Plus, Upload, Sparkles } from 'lucide-react';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';

export interface DictionaryEmptyHeroProps {
  onAddFirst: () => void;
  onImport: () => void;
  onUseExamples?: () => void;
}

export function DictionaryEmptyHero({
  onAddFirst,
  onImport,
  onUseExamples,
}: DictionaryEmptyHeroProps) {
  return (
    <Card variant="bordered" className="border-emerald-500/20">
      <div className="flex flex-col items-center text-center py-8 px-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-600/10 text-emerald-400 mb-4">
          <BookOpen className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-zinc-100">No custom terms yet</h3>
        <p className="text-sm text-zinc-400 mt-2 max-w-md leading-relaxed">
          Pin exact translations for names, brands, and jargon. The model will prefer these
          over freestyle wording.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={onAddFirst}>
            Add first term
          </Button>
          <Button variant="secondary" icon={<Upload className="w-4 h-4" />} onClick={onImport}>
            Import file
          </Button>
          {onUseExamples && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Sparkles className="w-3.5 h-3.5" />}
              onClick={onUseExamples}
            >
              Use examples
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
