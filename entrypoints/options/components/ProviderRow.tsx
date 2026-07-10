/**
 * Dense ops row for one provider in the rotation list.
 */

import {
  CheckCircle2,
  ChevronUp,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import type { KeyChipKind, KeyChipView } from '@/lib/poolDashboardStatus';
import { resolveProviderIdentity } from '@/lib/openAiCompatibleCatalog';
import type { PoolProvider } from '@/types/config';
import { Button } from '@/ui/Button';
import { Toggle } from '@/ui/Toggle';
import { ProviderIdentityBadge } from './ProviderIdentityBadge';

interface ProviderRowProps {
  provider: PoolProvider;
  chips: KeyChipView[];
  aggregateKind: KeyChipKind | 'mixed';
  onToggleEnabled: (enabled: boolean) => void;
  onTest: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onKeyChipClick: (keyId: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl.slice(0, 32) || 'no host';
  }
}

function AggregateBadge({ kind }: { kind: KeyChipKind | 'mixed' }) {
  if (kind === 'untested') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-amber-600/15 border-amber-500/20 text-amber-400">
        Untested
      </span>
    );
  }
  if (kind === 'mixed') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-zinc-600/15 border-zinc-500/20 text-zinc-400">
        Mixed
      </span>
    );
  }
  if (kind === 'healthy') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-emerald-600/15 border-emerald-500/20 text-emerald-400">
        <CheckCircle2 className="w-3 h-3" /> Verified
      </span>
    );
  }
  if (kind === 'cooling') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-amber-600/15 border-amber-500/20 text-amber-400">
        Cooling
      </span>
    );
  }
  if (kind === 'invalid' || kind === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-red-600/15 border-red-500/20 text-red-400">
        <XCircle className="w-3 h-3" /> {kind === 'invalid' ? 'Invalid' : 'Failed'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-zinc-600/15 border-zinc-500/20 text-zinc-500">
      Off
    </span>
  );
}

const CHIP_TONE: Record<KeyChipKind, string> = {
  healthy: 'bg-emerald-600/15 border-emerald-500/20 text-emerald-400',
  failed: 'bg-red-600/15 border-red-500/20 text-red-400',
  cooling: 'bg-amber-600/15 border-amber-500/20 text-amber-400',
  invalid: 'bg-red-600/15 border-red-500/20 text-red-400',
  off: 'bg-zinc-600/15 border-zinc-500/20 text-zinc-500',
  untested: 'bg-amber-600/15 border-amber-500/20 text-amber-400',
};

export function ProviderRow({
  provider,
  chips,
  aggregateKind,
  onToggleEnabled,
  onTest,
  onEdit,
  onRemove,
  onMove,
  onKeyChipClick,
  dragHandleProps,
}: ProviderRowProps) {
  const identity = resolveProviderIdentity(
    provider.displayName,
    provider.catalogId,
    provider.baseUrl,
  );
  const name = provider.displayName || 'Unnamed provider';

  return (
    <div
      className={`rounded-xl border border-white/10 bg-white/[0.01] px-3 py-3 transition-colors hover:border-white/15 ${
        provider.enabled ? '' : 'opacity-60'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          className="shrink-0 p-1 text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing"
          aria-label={`Drag to reorder ${name}`}
          {...dragHandleProps}
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <ProviderIdentityBadge
          accent={identity.accent}
          monogram={identity.monogram}
          enabled={provider.enabled}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-zinc-100 truncate">{name}</span>
            <AggregateBadge kind={aggregateKind} />
          </div>
          <div className="flex items-center gap-2 mt-0.5 min-w-0">
            <span className="text-xs text-zinc-500 font-mono truncate">
              {hostOf(provider.baseUrl)}
            </span>
            {provider.model ? (
              <span className="text-xs text-zinc-600 font-mono truncate hidden sm:inline">
                · {provider.model}
              </span>
            ) : null}
          </div>
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {chips.slice(0, 6).map((chip) => (
                <button
                  key={chip.keyId}
                  type="button"
                  title={chip.title}
                  aria-label={`${chip.label} key`}
                  onClick={() => onKeyChipClick(chip.keyId)}
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${CHIP_TONE[chip.kind]}`}
                >
                  {chip.label}
                </button>
              ))}
              {chips.length > 6 && (
                <span className="text-[10px] text-zinc-600">+{chips.length - 6}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Toggle
            checked={provider.enabled}
            onChange={onToggleEnabled}
            ariaLabel={`${name} enabled`}
          />
          <Button size="sm" variant="ghost" icon={<Zap className="w-3.5 h-3.5" />} onClick={onTest}>
            Test
          </Button>
          <Button size="sm" variant="secondary" icon={<Pencil className="w-3.5 h-3.5" />} onClick={onEdit}>
            Edit
          </Button>
          <div className="relative group">
            <Button
              size="sm"
              variant="ghost"
              icon={<MoreHorizontal className="w-3.5 h-3.5" />}
              aria-label={`${name} menu`}
            />
            <div className="absolute right-0 top-full mt-1 hidden group-hover:block group-focus-within:block z-10 min-w-[9rem] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
                onClick={() => onMove('up')}
              >
                <ChevronUp className="w-3 h-3" /> Move up
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
                onClick={() => onMove('down')}
              >
                <ChevronUp className="w-3 h-3 rotate-180" /> Move down
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs text-rose-400 hover:bg-zinc-800 flex items-center gap-2"
                onClick={onRemove}
              >
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function aggregateChipKind(chips: KeyChipView[]): KeyChipKind | 'mixed' {
  if (chips.length === 0) return 'untested';
  const kinds = new Set(chips.map((c) => c.kind));
  if (kinds.size === 1) return chips[0].kind;
  return 'mixed';
}
