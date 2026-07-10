/**
 * Shortcut Studio command bar — search, scope, status, Copy, Manage.
 */

import { Search, Copy, ExternalLink } from 'lucide-react';
import type { ScopeFilter } from '@/lib/shortcutDisplay';
import { Input } from '@/ui/Input';
import { Button } from '@/ui/Button';
import { Badge } from '@/ui/Badge';
import { Card } from '@/ui/Card';

const SCOPES: { id: ScopeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'global', label: 'Global' },
  { id: 'page', label: 'Page' },
  { id: 'gesture', label: 'Gesture' },
];

export interface ShortcutStudioBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  scope: ScopeFilter;
  onScopeChange: (s: ScopeFilter) => void;
  bound: number;
  total: number;
  onCopy: () => void;
  onManage: () => void;
}

export function ShortcutStudioBar({
  searchQuery,
  onSearchChange,
  scope,
  onScopeChange,
  bound,
  total,
  onCopy,
  onManage,
}: ShortcutStudioBarProps) {
  const allBound = total > 0 && bound === total;
  const statusLabel =
    total === 0 ? 'No global commands' : `${bound}/${total} global bound`;

  return (
    <Card variant="bordered" className="!p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex-1 min-w-0">
            <label htmlFor="shortcut-studio-search" className="sr-only">
              Search shortcuts
            </label>
            <Input
              id="shortcut-studio-search"
              type="search"
              icon={<Search className="w-4 h-4" />}
              placeholder="Search actions or keys…"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Badge variant={allBound ? 'success' : 'warning'}>{statusLabel}</Badge>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<Copy className="w-3.5 h-3.5" />}
              onClick={onCopy}
            >
              Copy all
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={<ExternalLink className="w-3.5 h-3.5" />}
              onClick={onManage}
            >
              Manage
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by scope">
          {SCOPES.map((s) => {
            const active = scope === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onScopeChange(s.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30'
                    : 'bg-zinc-800/60 text-zinc-400 border border-zinc-700/50 hover:text-zinc-200'
                }`}
                aria-pressed={active}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
