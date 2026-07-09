/**
 * Statistics Section — local analytics dashboard shell.
 * Period KPIs, hero strip, activity chart, cache efficiency.
 * Breakdowns / export menu / preferences land in Task 10.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  BarChart3,
  Database,
  Download,
  MousePointerClick,
  RefreshCw,
  Subtitles,
  Trash2,
  FileText,
  Layers,
} from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import {
  getStatsV2,
  resetStats,
  STATS_STORAGE_KEY,
} from '@/services/statsCollector';
import {
  loadDaysForPeriod,
  percentDelta,
  previousPeriodDates,
  sumCounters,
  sumLifetimeOrDays,
  type StatsPeriod,
} from '@/services/statsQuery';
import { getDailyRecord } from '@/services/statsIdb';
import {
  ZERO_COUNTERS,
  type DailyStatRecord,
  type StatCounters,
  type TranslationStatsV2,
} from '@/types/stats';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { EmptyState } from '@/ui/EmptyState';
import { DangerZone, DangerAction } from '@/ui/DangerZone';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Badge } from '@/ui/Badge';
import {
  buildChartDays,
  formatCompactNumber,
  formatDelta,
  getCacheEfficiency,
  hasDailyActivity,
  type DisplayDailyStat,
} from './statisticsDisplay';

const PERIOD_OPTIONS: Array<{ value: StatsPeriod; label: string }> = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
];

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time',
};

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatCharactersLabel(chars: number): string {
  return `${formatNumber(chars)} ${chars === 1 ? 'character' : 'characters'}`;
}

function formatRequestsLabel(apiCalls: number): string {
  return `${formatNumber(apiCalls)} ${apiCalls === 1 ? 'LLM request' : 'LLM requests'}`;
}

function formatCacheHitsLabel(cacheHits: number): string {
  return `${formatNumber(cacheHits)} ${cacheHits === 1 ? 'cache hit' : 'cache hits'}`;
}

function formatTrackingSince(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function formatLastActive(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function isLifetimeEmpty(lifetime: StatCounters): boolean {
  return (
    lifetime.characters === 0 &&
    lifetime.apiCalls === 0 &&
    lifetime.cacheHits === 0 &&
    lifetime.cacheMisses === 0 &&
    lifetime.cacheCharacters === 0 &&
    lifetime.pageSessions === 0 &&
    lifetime.subtitleCues === 0 &&
    lifetime.selectionEvents === 0 &&
    lifetime.inlineEvents === 0 &&
    lifetime.pdfEvents === 0
  );
}

async function loadPreviousPeriodTotals(period: StatsPeriod): Promise<StatCounters> {
  if (period === 'all') return { ...ZERO_COUNTERS };
  const dates = previousPeriodDates(period);
  if (dates.length === 0) return { ...ZERO_COUNTERS };

  const records: DailyStatRecord[] = [];
  for (const date of dates) {
    const record = await getDailyRecord(date);
    if (record) records.push(record);
  }
  return sumCounters(records);
}

interface StatKpiCardProps {
  icon: ReactNode;
  label: string;
  value: number;
  description: string;
}

function StatKpiCard({ icon, label, value, description }: StatKpiCardProps) {
  return (
    <Card variant="default">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-xs text-zinc-400">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-zinc-100">{formatCompactNumber(value)}</p>
      <p className="mt-1 text-[11px] text-zinc-500">{description}</p>
      <p className="sr-only">{formatNumber(value)}</p>
    </Card>
  );
}

interface DailyActivityChartProps {
  days: DisplayDailyStat[];
  period: StatsPeriod;
  retentionDays: number;
}

function DailyActivityChart({ days, period, retentionDays }: DailyActivityChartProps) {
  const maxChars = Math.max(...days.map((day) => day.chars), 1);
  const todayKey = new Date().toLocaleDateString('en-CA');

  if (days.length === 0 || !hasDailyActivity(days)) {
    return (
      <EmptyState
        icon={<Activity className="h-8 w-8" />}
        message="No translation data in this period yet. Start translating to see activity."
      />
    );
  }

  const chartLabel =
    period === 'all'
      ? `Daily translation activity (retained detail, last ${retentionDays} days max)`
      : `Daily translation activity for ${PERIOD_LABELS[period].toLowerCase()}`;

  return (
    <div>
      <div className="flex h-32 items-end gap-[2px]" role="list" aria-label={chartLabel}>
        {days.map((day) => {
          const height = day.chars > 0 ? Math.max((day.chars / maxChars) * 100, 3) : 0;
          const isToday = day.date === todayKey;
          const label = `${day.fullLabel}: ${formatCharactersLabel(day.chars)}, ${formatRequestsLabel(day.apiCalls)}, ${formatCacheHitsLabel(day.cacheHits)}`;

          return (
            <div
              key={day.date}
              className="group relative min-w-0 flex-1 focus-within:z-10"
              style={{ height: '100%' }}
              role="listitem"
            >
              <div
                role="img"
                tabIndex={0}
                aria-label={label}
                className={`absolute bottom-0 left-0 right-0 cursor-default rounded-t transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                  isToday
                    ? 'bg-cyan-400 group-hover:bg-cyan-300'
                    : 'bg-cyan-600/80 group-hover:bg-cyan-500'
                }`}
                style={{ height: `${height}%` }}
              />
              <div className="absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 group-hover:block group-focus-within:block">
                <div className="whitespace-nowrap rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 shadow-lg">
                  <div>{day.fullLabel}</div>
                  <div>{formatCharactersLabel(day.chars)}</div>
                  <div>{formatRequestsLabel(day.apiCalls)}</div>
                  <div>{formatCacheHitsLabel(day.cacheHits)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-zinc-500">
        <span>{days[0]?.label}</span>
        <span>{days[Math.floor(days.length / 2)]?.label}</span>
        <span>{days[days.length - 1]?.label}</span>
      </div>
      {period === 'all' && (
        <p className="mt-2 text-[11px] text-zinc-600">
          Daily detail available for the last {retentionDays} retained days. Lifetime KPIs cover all time.
        </p>
      )}
    </div>
  );
}

interface CacheEfficiencyCardProps {
  hits: number;
  misses: number;
}

function CacheEfficiencyCard({ hits, misses }: CacheEfficiencyCardProps) {
  const { totalOps, hitRate } = getCacheEfficiency(hits, misses);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = ((hitRate ?? 0) / 100) * circumference;
  const ringTone =
    hitRate === null
      ? 'text-zinc-600'
      : hitRate >= 70
        ? 'text-emerald-400'
        : hitRate >= 40
          ? 'text-cyan-400'
          : 'text-amber-400';

  return (
    <Card title="Cache Efficiency" icon={<Database className="h-3.5 w-3.5" />} variant="bordered" accent="cyan">
      {hitRate === null ? (
        <EmptyState icon={<Database className="h-8 w-8" />} message="No cache activity yet" />
      ) : (
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="relative shrink-0 self-center" aria-label={`Cache hit rate ${hitRate}%`}>
            <svg width="100" height="100" className="-rotate-90" aria-hidden="true">
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="currentColor"
                className="text-zinc-800"
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="currentColor"
                className={ringTone}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${strokeDash} ${circumference}`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold tabular-nums text-zinc-100">{hitRate}%</span>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-3 gap-3">
            <div>
              <span className="text-xs text-zinc-400">Hits</span>
              <p className="text-lg font-semibold tabular-nums text-zinc-100">{formatNumber(hits)}</p>
            </div>
            <div>
              <span className="text-xs text-zinc-400">Misses</span>
              <p className="text-lg font-semibold tabular-nums text-zinc-100">{formatNumber(misses)}</p>
            </div>
            <div>
              <span className="text-xs text-zinc-400">Lookups</span>
              <p className="text-lg font-semibold tabular-nums text-zinc-100">{formatNumber(totalOps)}</p>
            </div>
          </div>
        </div>
      )}
      {hitRate !== null && (
        <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
          ~{formatNumber(hits)} lookups served from cache this period. Tune TTL and size under Advanced →
          Performance.
        </p>
      )}
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" data-testid="stats-loading-skeleton" aria-busy="true" aria-label="Loading statistics">
      <div className="h-28 animate-pulse rounded-xl border border-white/10 bg-zinc-900/60" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-white/5 bg-zinc-900/50" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <div className="h-48 animate-pulse rounded-xl border border-white/10 bg-zinc-900/50" />
        <div className="h-48 animate-pulse rounded-xl border border-white/10 bg-zinc-900/50" />
      </div>
    </div>
  );
}

interface StatHeroProps {
  period: StatsPeriod;
  totals: StatCounters;
  charDelta: number | null;
  lastActiveAt: string | null;
  trackingSince: string;
}

function StatHero({ period, totals, charDelta, lastActiveAt, trackingSince }: StatHeroProps) {
  const { hitRate } = getCacheEfficiency(totals.cacheHits, totals.cacheMisses);
  const deltaLabel = formatDelta(charDelta);
  const deltaTone =
    charDelta === null
      ? 'text-zinc-500'
      : charDelta > 0
        ? 'text-emerald-400'
        : charDelta < 0
          ? 'text-amber-400'
          : 'text-zinc-400';

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-cyan-500/[0.07] via-zinc-950/40 to-zinc-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="grid gap-0 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="border-b border-white/5 p-4 sm:border-b-0 sm:border-r">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              <Activity className="h-3.5 w-3.5 text-cyan-500/80" aria-hidden="true" />
              {PERIOD_LABELS[period]} · characters
            </div>
            {period !== 'all' && (
              <span className={`text-[11px] font-medium tabular-nums ${deltaTone}`} title="vs previous period">
                {deltaLabel}
                {charDelta !== null ? ' vs prior' : ''}
              </span>
            )}
          </div>
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-zinc-50">
            {formatCompactNumber(totals.characters)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {formatNumber(totals.characters)} characters translated in this period
          </p>
        </div>

        <div className="flex flex-col justify-between gap-3 p-4">
          <div>
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Snapshot
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-300">
              <span className="tabular-nums">
                <span className="text-zinc-500">API calls </span>
                {formatNumber(totals.apiCalls)}
              </span>
              <span className="tabular-nums">
                <span className="text-zinc-500">Cache hit </span>
                {hitRate === null ? '—' : `${hitRate}%`}
              </span>
              <span className="tabular-nums">
                <span className="text-zinc-500">Last active </span>
                {formatLastActive(lastActiveAt)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-300">
              Local only
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
              Tracking since {formatTrackingSince(trackingSince)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StatisticsSection() {
  const [period, setPeriod] = useState<StatsPeriod>('30d');
  const [summary, setSummary] = useState<TranslationStatsV2 | null>(null);
  const [days, setDays] = useState<DailyStatRecord[]>([]);
  const [previousTotals, setPreviousTotals] = useState<StatCounters>({ ...ZERO_COUNTERS });
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [nextSummary, nextDays, prevTotals] = await Promise.all([
        getStatsV2(),
        loadDaysForPeriod(period),
        loadPreviousPeriodTotals(period),
      ]);
      setSummary(nextSummary);
      setDays(nextDays);
      setPreviousTotals(prevTotals);
    } catch {
      setError('Unable to load statistics');
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    const storageChanges = globalThis.chrome?.storage?.onChanged;
    if (!storageChanges) return;

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      if (!Object.prototype.hasOwnProperty.call(changes, STATS_STORAGE_KEY)) return;
      void loadStats();
    };

    storageChanges.addListener(handleStorageChange);
    return () => storageChanges.removeListener(handleStorageChange);
  }, [loadStats]);

  async function handleReset() {
    setIsResetting(true);
    setError(null);
    try {
      await resetStats();
      setShowResetModal(false);
      await loadStats();
    } catch {
      setError('Unable to reset statistics');
    } finally {
      setIsResetting(false);
    }
  }

  const periodTotals = useMemo(() => {
    if (!summary) return { ...ZERO_COUNTERS };
    return sumLifetimeOrDays(summary.lifetime, days, period);
  }, [summary, days, period]);

  const charDelta = useMemo(() => {
    if (period === 'all') return null;
    return percentDelta(periodTotals.characters, previousTotals.characters);
  }, [period, periodTotals.characters, previousTotals.characters]);

  const chartDays = useMemo(
    () => buildChartDays(days, period),
    [days, period],
  );

  const isEmpty =
    !isLoading &&
    !error &&
    summary !== null &&
    isLifetimeEmpty(summary.lifetime) &&
    days.length === 0;

  const retentionDays = summary?.preferences.retentionDays ?? 90;

  const resetDangerZone = (
    <DangerZone description="Usage metrics only. Translation cache and settings stay intact.">
      <DangerAction
        severity="caution"
        icon={<Trash2 />}
        title="Reset usage statistics"
        description="Clears collected counters and daily activity charts. Does not touch cache or settings."
        action={
          <Button
            variant="warning"
            size="sm"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            loading={isResetting}
            disabled={isResetting}
            onClick={() => setShowResetModal(true)}
          >
            Reset statistics
          </Button>
        }
      />
    </DangerZone>
  );

  const metricCards: StatKpiCardProps[] = [
    {
      label: 'LLM Characters',
      value: periodTotals.characters,
      description: 'Fresh characters sent to the LLM.',
      icon: <Activity className="h-4 w-4 text-cyan-400" />,
    },
    {
      label: 'API Calls',
      value: periodTotals.apiCalls,
      description: 'Translation requests and subtitle chunks.',
      icon: <RefreshCw className="h-4 w-4 text-emerald-400" />,
    },
    {
      label: 'Cache Characters',
      value: periodTotals.cacheCharacters,
      description: 'Characters served from local cache.',
      icon: <Layers className="h-4 w-4 text-teal-400" />,
    },
    {
      label: 'Page Sessions',
      value: periodTotals.pageSessions,
      description: 'Page translation sessions started once per tab.',
      icon: <FileText className="h-4 w-4 text-sky-400" />,
    },
    {
      label: 'Subtitle Cues',
      value: periodTotals.subtitleCues,
      description: 'Subtitle cues processed for translation.',
      icon: <Subtitles className="h-4 w-4 text-amber-400" />,
    },
    {
      label: 'Selection Events',
      value: periodTotals.selectionEvents,
      description: 'Selection and dictionary translations.',
      icon: <MousePointerClick className="h-4 w-4 text-orange-400" />,
    },
  ];

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Statistics"
        description="Local usage analytics for translation volume, cache efficiency, and where you translate."
        icon={<BarChart3 className="h-4 w-4" />}
        accentColor="cyan"
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <SegmentedControl
            id="stats-period"
            label="Period"
            size="sm"
            options={PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<Download className="h-3.5 w-3.5" />}
          disabled
          title="Export arrives in the next update"
          aria-label="Export"
        >
          Export
        </Button>
      </div>

      <div className="space-y-4">
        {error && (
          <div className="animate-stagger" style={stagger(0)}>
            <Card variant="bordered" accent="red">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-red-300">{error}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Statistics are stored locally in Chrome storage and IndexedDB.
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => void loadStats()}>
                  Retry
                </Button>
              </div>
            </Card>
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton />
        ) : isEmpty ? (
          <div className="space-y-4" data-testid="stats-empty-state">
            <Card variant="bordered">
              <EmptyState
                icon={<BarChart3 className="h-8 w-8" />}
                message="No translation data yet. Start translating pages, subtitles, or selections to see your stats."
              />
              <p className="pb-2 text-center text-[11px] text-zinc-600">
                All metrics stay on this device — no page content or API keys are stored in statistics.
              </p>
            </Card>
            {resetDangerZone}
          </div>
        ) : summary ? (
          <>
            <div className="animate-stagger" style={stagger(1)}>
              <StatHero
                period={period}
                totals={periodTotals}
                charDelta={charDelta}
                lastActiveAt={summary.lastActiveAt}
                trackingSince={summary.trackingSince}
              />
            </div>

            <div className="animate-stagger" style={stagger(2)}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {metricCards.map((metric) => (
                  <StatKpiCard key={metric.label} {...metric} />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
              <div className="animate-stagger" style={stagger(3)}>
                <Card
                  title={`Activity (${PERIOD_LABELS[period]})`}
                  description="Characters translated per day in the selected period."
                  icon={<Activity className="h-3.5 w-3.5" />}
                  variant="bordered"
                  headerExtra={
                    period === 'all' ? (
                      <Badge variant="info">Retained days</Badge>
                    ) : undefined
                  }
                >
                  <DailyActivityChart
                    days={chartDays}
                    period={period}
                    retentionDays={retentionDays}
                  />
                </Card>
              </div>

              <div className="animate-stagger" style={stagger(4)}>
                <CacheEfficiencyCard
                  hits={periodTotals.cacheHits}
                  misses={periodTotals.cacheMisses}
                />
              </div>
            </div>

            <div className="animate-stagger" style={stagger(5)}>
              {resetDangerZone}
            </div>
          </>
        ) : null}
      </div>

      {showResetModal && (
        <Modal
          title="Reset usage statistics?"
          message={
            <div className="space-y-3">
              <p>This permanently clears collected usage counters and charts.</p>
              <ul className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-xs text-zinc-400">
                <li className="flex gap-2">
                  <span className="text-amber-400/80">•</span>
                  Lifetime totals and daily detail are wiped
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400/70">•</span>
                  Translation cache is not affected
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400/70">•</span>
                  Settings and provider config stay intact
                </li>
              </ul>
            </div>
          }
          variant="danger"
          confirmLabel="Reset statistics"
          cancelLabel="Keep statistics"
          onConfirm={() => void handleReset()}
          onCancel={() => setShowResetModal(false)}
        />
      )}
    </div>
  );
}
