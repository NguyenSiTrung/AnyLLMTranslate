/**
 * AdvancedSectionNav — explicit, state-free navigation for the Advanced tab.
 * Replaces the old "Active features" status chips: nav color never encodes
 * feature state; card badges own all status communication.
 */

import { BrainCircuit, Bug, Database, Gauge, Globe } from 'lucide-react';
import {
  ADVANCED_SECTION_IDS,
  scrollToAdvancedSection,
} from '@/entrypoints/options/lib/scrollToAdvancedSection';

const ITEMS = [
  { id: ADVANCED_SECTION_IDS.translation, label: 'Translation engine', icon: BrainCircuit },
  { id: ADVANCED_SECTION_IDS.performance, label: 'Performance', icon: Gauge },
  { id: ADVANCED_SECTION_IDS.compatibility, label: 'Website compatibility', icon: Globe },
  { id: ADVANCED_SECTION_IDS.data, label: 'Data and recovery', icon: Database },
  { id: ADVANCED_SECTION_IDS.diagnostics, label: 'Diagnostics', icon: Bug },
] as const;

export function AdvancedSectionNav() {
  return (
    <nav
      aria-label="Advanced sections"
      className="sticky top-0 z-10 mb-4 -mx-1 overflow-x-auto px-1 py-2 backdrop-blur-md"
    >
      <div className="flex min-w-max gap-2 rounded-xl border border-white/10 bg-zinc-950/90 p-2">
        {ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => scrollToAdvancedSection(id)}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
