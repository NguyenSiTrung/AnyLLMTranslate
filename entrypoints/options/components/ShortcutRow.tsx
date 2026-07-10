/**
 * Single shortcut binding row for Shortcut Studio.
 */

import type { ReactNode } from 'react';
import type { ShortcutDisplayRow } from '@/lib/shortcutDisplay';
import { Badge } from '@/ui/Badge';
import { KeyCapSequence } from './KeyCapSequence';

const SCOPE_BADGE: Record<ShortcutDisplayRow['scope'], string> = {
  global: 'Global',
  page: 'Page',
  gesture: 'Gesture',
};

export interface ShortcutRowProps {
  row: ShortcutDisplayRow;
  action?: ReactNode;
}

export function ShortcutRow({ row, action }: ShortcutRowProps) {
  const unbound = !row.shortcut.trim();

  return (
    <div
      role="listitem"
      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-5 py-3.5 hover:bg-zinc-800/30 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-zinc-200">{row.label}</p>
          <Badge variant="info">{SCOPE_BADGE[row.scope]}</Badge>
          {unbound ? <Badge variant="warning">Not set</Badge> : null}
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">{row.description}</p>
        <p className="text-[11px] text-zinc-600 mt-1">{row.where}</p>
        {unbound ? (
          <p className="text-[11px] text-amber-500/90 mt-1">Set in browser shortcuts</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
        {!unbound ? <KeyCapSequence shortcut={row.shortcut} /> : null}
        {action}
      </div>
    </div>
  );
}
