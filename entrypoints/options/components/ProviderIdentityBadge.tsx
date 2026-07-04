/**
 * Colored monogram badge for a provider (FR-2).
 *
 * Renders a small square badge containing the provider's monogram, tinted by
 * its accent color. Reuses the readiness-banner token pattern
 * (`bg-X-600/15 border-X-500/20 text-X-400`) — NO new ad-hoc opacity values
 * (NFR-4). Falls back to zinc + first letter when no catalog entry resolves.
 *
 * The accent→class map mirrors `SectionHeader.tsx`'s `accentMap`. Intentionally
 * duplicated so this UI component does not need to depend on or mutate the
 * header's internal map.
 */

import type { ProviderAccent } from '@/lib/openAiCompatibleCatalog';

const ACCENT_MAP: Record<ProviderAccent, { bg: string; border: string; text: string }> = {
  blue:    { bg: 'bg-blue-600/15',    border: 'border-blue-500/20',    text: 'text-blue-400' },
  pink:    { bg: 'bg-pink-600/15',    border: 'border-pink-500/20',    text: 'text-pink-400' },
  emerald: { bg: 'bg-emerald-600/15', border: 'border-emerald-500/20', text: 'text-emerald-400' },
  amber:   { bg: 'bg-amber-600/15',   border: 'border-amber-500/20',   text: 'text-amber-400' },
  zinc:    { bg: 'bg-zinc-600/15',    border: 'border-zinc-500/20',    text: 'text-zinc-400' },
  teal:    { bg: 'bg-teal-600/15',    border: 'border-teal-500/20',    text: 'text-teal-400' },
  cyan:    { bg: 'bg-cyan-600/15',    border: 'border-cyan-500/20',    text: 'text-cyan-400' },
  orange:  { bg: 'bg-orange-600/15',  border: 'border-orange-500/20',  text: 'text-orange-400' },
};

interface ProviderIdentityBadgeProps {
  accent: ProviderAccent;
  monogram: string;
  /** Whether the provider is enabled; dimmed when disabled to match header. */
  enabled?: boolean;
}

export function ProviderIdentityBadge({
  accent,
  monogram,
  enabled = true,
}: ProviderIdentityBadgeProps) {
  const a = ACCENT_MAP[accent];
  return (
    <span
      aria-hidden="true"
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${a.bg} ${a.border} ${a.text} text-[11px] font-bold tracking-tight uppercase ${
        enabled ? '' : 'opacity-60'
      }`}
    >
      {monogram}
    </span>
  );
}
