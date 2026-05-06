/**
 * Reusable section header for settings pages.
 * Sticky with backdrop blur, icon with accent color, title + description.
 * Replaces the duplicated inline header pattern across all sections.
 */

import type { ReactNode } from 'react';

type AccentColor = 'blue' | 'pink' | 'emerald' | 'amber' | 'zinc' | 'teal' | 'cyan' | 'orange';

interface SectionHeaderProps {
  title: string;
  description: string;
  icon: ReactNode;
  accentColor: AccentColor;
}

const accentMap: Record<AccentColor, { bg: string; border: string; text: string }> = {
  blue:    { bg: 'bg-blue-600/15',    border: 'border-blue-500/20',    text: 'text-blue-400' },
  pink:    { bg: 'bg-pink-600/15',    border: 'border-pink-500/20',    text: 'text-pink-400' },
  emerald: { bg: 'bg-emerald-600/15', border: 'border-emerald-500/20', text: 'text-emerald-400' },
  amber:   { bg: 'bg-amber-600/15',   border: 'border-amber-500/20',   text: 'text-amber-400' },
  zinc:    { bg: 'bg-zinc-600/15',    border: 'border-zinc-500/20',    text: 'text-zinc-400' },
  teal:    { bg: 'bg-teal-600/15',    border: 'border-teal-500/20',    text: 'text-teal-400' },
  cyan:    { bg: 'bg-cyan-600/15',    border: 'border-cyan-500/20',    text: 'text-cyan-400' },
  orange:  { bg: 'bg-orange-600/15',  border: 'border-orange-500/20',  text: 'text-orange-400' },
};

export function SectionHeader({ title, description, icon, accentColor }: SectionHeaderProps) {
  const accent = accentMap[accentColor];

  return (
    <div className="sticky top-0 z-10 backdrop-blur-md bg-[#09090b]/95 pt-4 pb-4 mb-3 -mt-4 flex items-center gap-3">
      <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${accent.bg} border ${accent.border}`}>
        <span className={accent.text}>{icon}</span>
      </div>
      <div>
        <h2 className="text-base font-semibold text-zinc-100 leading-tight">{title}</h2>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}
