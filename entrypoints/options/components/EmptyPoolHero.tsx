/**
 * First-run empty state for the Providers pool.
 */

import { Layers, Plus } from 'lucide-react';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ProviderIdentityBadge } from './ProviderIdentityBadge';

const HERO_MONOGRAMS: Array<{ monogram: string; accent: 'blue' | 'pink' | 'emerald' | 'amber' | 'teal' | 'cyan' }> = [
  { monogram: 'OR', accent: 'pink' },
  { monogram: 'GQ', accent: 'amber' },
  { monogram: 'OL', accent: 'emerald' },
  { monogram: 'OA', accent: 'teal' },
  { monogram: 'LM', accent: 'cyan' },
  { monogram: 'CU', accent: 'blue' },
];

interface EmptyPoolHeroProps {
  onAddProvider: () => void;
  onOpenSetup?: () => void;
}

export function EmptyPoolHero({ onAddProvider, onOpenSetup }: EmptyPoolHeroProps) {
  return (
    <Card variant="bordered" className="border-cyan-500/20">
      <div className="flex flex-col items-center text-center py-8 px-4">
        <div className="flex items-center justify-center gap-2 mb-5 opacity-60">
          {HERO_MONOGRAMS.map((m) => (
            <ProviderIdentityBadge
              key={m.monogram}
              accent={m.accent}
              monogram={m.monogram}
            />
          ))}
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-600/10 text-cyan-400 mb-4">
          <Layers className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-zinc-100">Connect your first LLM</h3>
        <p className="text-sm text-zinc-400 mt-2 max-w-md leading-relaxed">
          Pick a provider, add a key, verify — then translate any page.
        </p>
        <p className="text-[11px] uppercase tracking-widest text-zinc-600 mt-4">
          1 Choose · 2 Connect · 3 Verify
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
          <Button
            variant="primary"
            icon={<Plus className="w-4 h-4" />}
            onClick={onAddProvider}
          >
            Add provider
          </Button>
          {onOpenSetup && (
            <Button variant="secondary" onClick={onOpenSetup}>
              Open setup guide
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
