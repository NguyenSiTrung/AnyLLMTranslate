/**
 * Statistics Section — translation usage stats, cache efficiency, daily chart.
 * Header uses inline SectionHeader pattern (consistent with GeneralSection).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, BarChart3, Database, RefreshCw, Subtitles, Trash2 } from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { getStats, resetStats, STATS_STORAGE_KEY } from '@/services/statsCollector';
import { DEFAULT_STATS, type TranslationStats } from '@/types/stats';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { EmptyState } from '@/ui/EmptyState';
import {
  buildLast30Days,
  getCacheEfficiency,
  hasDailyActivity,
  type DisplayDailyStat,
} from './statisticsDisplay';

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

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: number;
  description: string;
}

function StatCard({ icon, label, value, description }: StatCardProps) {
  return (
    <Card variant="default">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-zinc-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-zinc-100">{formatNumber(value)}</p>
      <p className="text-[11px] text-zinc-500 mt-1">{description}</p>
    </Card>
  );
}

interface DailyActivityChartProps {
  days: DisplayDailyStat[];
}

function DailyActivityChart({ days }: DailyActivityChartProps) {
  const maxChars = Math.max(...days.map((day) => day.chars), 1);

  if (!hasDailyActivity(days)) {
    return (
      <EmptyState
        icon={<Activity className="w-8 h-8" />}
        message="No translation data yet. Start translating to see your stats."
      />
    );
  }

  return (
    <div>
      <div className="flex items-end gap-[2px] h-32" role="list" aria-label="Daily translation activity for the last 30 days">
        {days.map((day) => {
          const height = day.chars > 0 ? Math.max((day.chars / maxChars) * 100, 3) : 0;
          const label = `${day.fullLabel}: ${formatCharactersLabel(day.chars)}, ${formatRequestsLabel(day.apiCalls)}, ${formatCacheHitsLabel(day.cacheHits)}`;

          return (
            <div
              key={day.date}
              className="flex-1 min-w-0 group relative focus-within:z-10"
              style={{ height: '100%' }}
              role="listitem"
            >
              <div
                role="img"
                tabIndex={0}
                aria-label={label}
                className="absolute bottom-0 left-0 right-0 rounded-t bg-blue-500 transition-all duration-200 group-hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 cursor-default"
                style={{ height: `${height}%` }}
              />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block group-focus-within:block z-10">
                <div className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 whitespace-nowrap shadow-lg">
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
      <div className="flex justify-between mt-2 text-[10px] text-zinc-500">
        <span>{days[0]?.label}</span>
        <span>{days[Math.floor(days.length / 2)]?.label}</span>
        <span>{days[days.length - 1]?.label}</span>
      </div>
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

  return (
    <Card title="Cache Efficiency" icon={<Database className="w-3.5 h-3.5" />} variant="bordered">
      {hitRate === null ? (
        <EmptyState
          icon={<Database className="w-8 h-8" />}
          message="No cache activity yet"
        />
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="relative shrink-0 self-center" aria-label={`Cache hit rate ${hitRate}%`}>
            <svg width="100" height="100" className="-rotate-90" aria-hidden="true">
              <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" className="text-zinc-800" strokeWidth="8" />
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="currentColor"
                className="text-blue-500"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${strokeDash} ${circumference}`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-zinc-100">{hitRate}%</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 flex-1">
            <div>
              <span className="text-xs text-zinc-400">Hits</span>
              <p className="text-lg font-semibold text-zinc-100">{formatNumber(hits)}</p>
            </div>
            <div>
              <span className="text-xs text-zinc-400">Misses</span>
              <p className="text-lg font-semibold text-zinc-100">{formatNumber(misses)}</p>
            </div>
            <div>
              <span className="text-xs text-zinc-400">Lookups</span>
              <p className="text-lg font-semibold text-zinc-100">{formatNumber(totalOps)}</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export function StatisticsSection() {
  const [stats, setStats] = useState<TranslationStats>(DEFAULT_STATS);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getStats();
      setStats(data);
    } catch {
      setError('Unable to load statistics');
    } finally {
      setIsLoading(false);
    }
  }, []);

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
      const nextStats = changes[STATS_STORAGE_KEY]?.newValue as TranslationStats | undefined;
      setStats(nextStats ?? { ...DEFAULT_STATS });
      setError(null);
      setIsLoading(false);
    };

    storageChanges.addListener(handleStorageChange);
    return () => storageChanges.removeListener(handleStorageChange);
  }, []);

  async function handleReset() {
    setIsResetting(true);
    setError(null);
    try {
      await resetStats();
      setStats({ ...DEFAULT_STATS });
      setShowResetModal(false);
    } catch {
      setError('Unable to reset statistics');
    } finally {
      setIsResetting(false);
    }
  }

  const dailyStats = useMemo(() => buildLast30Days(stats.dailyStats), [stats.dailyStats]);

  const metricCards = [
    {
      label: 'LLM Characters',
      value: stats.totalCharactersTranslated,
      description: 'Fresh characters sent to the LLM.',
      icon: <Activity className="w-4 h-4 text-blue-400" />,
    },
    {
      label: 'LLM Requests',
      value: stats.totalApiCalls,
      description: 'Translation requests and subtitle chunks.',
      icon: <RefreshCw className="w-4 h-4 text-emerald-400" />,
    },
    {
      label: 'Page Sessions',
      value: stats.totalPagesTranslated,
      description: 'Page translation sessions started once per tab.',
      icon: <BarChart3 className="w-4 h-4 text-amber-400" />,
    },
    {
      label: 'Subtitle Cues',
      value: stats.totalSubtitlesCuesTranslated,
      description: 'Subtitle cues processed for translation.',
      icon: <Subtitles className="w-4 h-4 text-purple-400" />,
    },
  ];

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Statistics"
        description="Translation usage and performance metrics."
        icon={<BarChart3 className="w-4 h-4" />}
        accentColor="blue"
      />

      <div className="space-y-4">
        {error && (
          <div className="animate-stagger" style={stagger(0)}>
            <Card variant="bordered" accent="red">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-red-300">{error}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Statistics are stored locally in Chrome storage.</p>
                </div>
                <Button variant="secondary" size="sm" onClick={loadStats}>Retry</Button>
              </div>
            </Card>
          </div>
        )}

        {isLoading ? (
          <Card variant="default">
            <div className="h-32 flex items-center justify-center text-sm text-zinc-500 animate-pulse">
              Loading statistics...
            </div>
          </Card>
        ) : (
          <>
            <div className="animate-stagger" style={stagger(1)}>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {metricCards.map((metric) => (
                  <StatCard
                    key={metric.label}
                    icon={metric.icon}
                    label={metric.label}
                    value={metric.value}
                    description={metric.description}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)] gap-4">
              <div className="animate-stagger" style={stagger(2)}>
                <Card title="Daily Activity (Last 30 Days)" icon={<Activity className="w-3.5 h-3.5" />} variant="bordered">
                  <DailyActivityChart days={dailyStats} />
                </Card>
              </div>

              <div className="animate-stagger" style={stagger(3)}>
                <CacheEfficiencyCard hits={stats.totalCacheHits} misses={stats.totalCacheMisses} />
              </div>
            </div>

            <div className="animate-stagger" style={stagger(4)}>
              <Card variant="bordered" accent="red">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">Danger Zone</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Reset collected usage statistics. Translation cache and settings are not affected.
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                    loading={isResetting}
                    disabled={isResetting}
                    onClick={() => setShowResetModal(true)}
                  >
                    Reset Statistics
                  </Button>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <Modal
          title="Reset Statistics"
          message="This will permanently clear all translation statistics. Your translation cache and settings will not be affected."
          variant="danger"
          confirmLabel="Reset"
          cancelLabel="Cancel"
          onConfirm={handleReset}
          onCancel={() => setShowResetModal(false)}
        />
      )}
    </div>
  );
}
