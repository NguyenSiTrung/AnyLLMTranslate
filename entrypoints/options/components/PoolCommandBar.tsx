/**
 * Pool status command bar — readiness, metrics, global actions.
 */

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  PauseCircle,
  Plus,
  Zap,
} from 'lucide-react';
import type { PoolDashboardView } from '@/lib/poolDashboardStatus';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';

interface PoolCommandBarProps {
  view: PoolDashboardView;
  liveAvailable: boolean;
  isBulkTesting: boolean;
  bulkTestProgress: { done: number; total: number } | null;
  onTestAll: () => void;
  onAddProvider: () => void;
  onOpenSetup?: () => void;
  onNavigateToAdvanced?: () => void;
}

export function PoolCommandBar({
  view,
  liveAvailable,
  isBulkTesting,
  bulkTestProgress,
  onTestAll,
  onAddProvider,
  onOpenSetup,
  onNavigateToAdvanced,
}: PoolCommandBarProps) {
  const isReady = view.state === 'ready';
  const isDegraded = view.state === 'degraded';
  const border = isReady
    ? 'border-emerald-500/30'
    : isDegraded
      ? 'border-amber-500/40'
      : 'border-amber-500/30';

  const Icon = isReady
    ? CheckCircle2
    : isDegraded
      ? PauseCircle
      : AlertTriangle;
  const iconTone = isReady
    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
    : 'bg-amber-500/10 border-amber-500/20 text-amber-400';

  return (
    <Card variant="bordered" className={border}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${iconTone}`}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-zinc-100">{view.title}</h3>
            <p className="text-xs text-zinc-400 mt-1 leading-5">{view.description}</p>
            <p className="text-xs text-zinc-500 mt-1">{view.action}</p>
            <p className="text-xs text-zinc-500 mt-1.5">
              {view.providerCount} provider{view.providerCount !== 1 ? 's' : ''} ·{' '}
              {view.healthyKeyCount} healthy · {view.coolingKeyCount} cooling ·{' '}
              {view.enabledKeyCount} enabled key
              {view.enabledKeyCount !== 1 ? 's' : ''}
            </p>
            {!liveAvailable && (
              <p className="text-xs text-zinc-600 mt-1">
                Live status unavailable — showing last test results.
              </p>
            )}
            {onNavigateToAdvanced && (
              <button
                type="button"
                onClick={onNavigateToAdvanced}
                className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors mt-1"
              >
                Edit system prompt <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {view.enabledKeyCount > 0 && (
            <Button
              size="sm"
              variant="secondary"
              loading={isBulkTesting}
              icon={!isBulkTesting ? <Zap className="w-3.5 h-3.5" /> : undefined}
              onClick={onTestAll}
            >
              {isBulkTesting && bulkTestProgress
                ? `Testing ${bulkTestProgress.done}/${bulkTestProgress.total}…`
                : 'Test all keys'}
            </Button>
          )}
          <Button
            size="sm"
            variant={view.canTranslate ? 'secondary' : 'primary'}
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={onAddProvider}
          >
            Add provider
          </Button>
          {onOpenSetup && (
            <Button size="sm" variant="ghost" onClick={onOpenSetup}>
              Setup guide
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
