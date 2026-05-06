/**
 * Statistics Section — translation usage stats, cache efficiency, daily chart.
 * Header uses inline SectionHeader pattern (consistent with GeneralSection).
 */

import { useState, useEffect } from 'react';
import { BarChart3, Activity, Database, Subtitles, RefreshCw, Trash2 } from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { stagger } from '@/lib/styleUtils';
import { getStats, resetStats } from '@/services/statsCollector';
import { DEFAULT_STATS, type TranslationStats } from '@/types/stats';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function StatisticsSection() {
  const [stats, setStats] = useState<TranslationStats>(DEFAULT_STATS);
  const [showResetModal, setShowResetModal] = useState(false);
  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    const data = await getStats();
    setStats(data);
  }

  async function handleReset() {
    await resetStats();
    setStats({ ...DEFAULT_STATS });
    setShowResetModal(false);
  }

  const cacheTotal = stats.totalCacheHits + stats.totalCacheMisses;
  const cacheHitRate = cacheTotal > 0
    ? Math.round((stats.totalCacheHits / cacheTotal) * 100)
    : 0;

  // SVG progress ring params
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = (cacheHitRate / 100) * circumference;

  // Daily chart (last 30 days)
  const dailyStats = stats.dailyStats;
  const maxChars = dailyStats.length > 0
    ? Math.max(...dailyStats.map((d) => d.chars), 1)
    : 1;

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Statistics"
        description="Translation usage and performance metrics."
        icon={<BarChart3 className="w-4 h-4" />}
        accentColor="blue"
      />

      <div className="space-y-4">
        {/* Summary cards */}
        <div className="animate-stagger" style={stagger(0)}>
          <div className="grid grid-cols-2 gap-4">
            <Card variant="default">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-zinc-400">Total Characters</span>
              </div>
              <p className="text-2xl font-bold text-zinc-100">
                {formatNumber(stats.totalCharactersTranslated)}
              </p>
            </Card>

            <Card variant="default">
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-zinc-400">API Calls</span>
              </div>
              <p className="text-2xl font-bold text-zinc-100">
                {formatNumber(stats.totalApiCalls)}
              </p>
            </Card>

            <Card variant="default">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-zinc-400">Pages Translated</span>
              </div>
              <p className="text-2xl font-bold text-zinc-100">
                {formatNumber(stats.totalPagesTranslated)}
              </p>
            </Card>

            <Card variant="default">
              <div className="flex items-center gap-2 mb-2">
                <Subtitles className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-zinc-400">Subtitle Cues</span>
              </div>
              <p className="text-2xl font-bold text-zinc-100">
                {formatNumber(stats.totalSubtitlesCuesTranslated)}
              </p>
            </Card>
          </div>
        </div>

        {/* Cache Efficiency */}
        <div className="animate-stagger" style={stagger(1)}>
          <Card title="Cache Efficiency" icon={<Database className="w-3.5 h-3.5" />} variant="bordered">
            <div className="flex items-center gap-6">
              {/* Progress ring */}
              <div className="relative shrink-0">
                <svg width="100" height="100" className="-rotate-90">
                  <circle
                    cx="50" cy="50" r={radius}
                    fill="none"
                    stroke="currentColor"
                    className="text-zinc-800"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50" cy="50" r={radius}
                    fill="none"
                    stroke="currentColor"
                    className="text-blue-500"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${strokeDash} ${circumference}`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold text-zinc-100">{cacheHitRate}%</span>
                </div>
              </div>
              {/* Hit / Miss numbers */}
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-zinc-400">Cache Hits</span>
                  <p className="text-lg font-semibold text-zinc-100">{formatNumber(stats.totalCacheHits)}</p>
                </div>
                <div>
                  <span className="text-xs text-zinc-400">Cache Misses</span>
                  <p className="text-lg font-semibold text-zinc-100">{formatNumber(stats.totalCacheMisses)}</p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Daily Chart (last 30 days) */}
        <div className="animate-stagger" style={stagger(2)}>
          <Card title="Daily Activity (Last 30 Days)" icon={<Activity className="w-3.5 h-3.5" />} variant="bordered">
            {dailyStats.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-zinc-500">
                No translation data yet. Start translating to see your stats!
              </div>
            ) : (
              <div>
                <div className="flex items-end gap-[2px] h-32">
                  {dailyStats.map((day) => {
                    const height = Math.max((day.chars / maxChars) * 100, 2);
                    return (
                      <div
                        key={day.date}
                        className="flex-1 min-w-0 group relative"
                        style={{ height: '100%' }}
                      >
                        <div
                          className="absolute bottom-0 left-0 right-0 bg-blue-500 rounded-t transition-all duration-200 group-hover:bg-blue-400"
                          style={{ height: `${height}%` }}
                        />
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                          <div className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 whitespace-nowrap shadow-lg">
                            <div>{day.date}</div>
                            <div>{formatNumber(day.chars)} chars</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Date labels */}
                <div className="flex justify-between mt-2 text-[10px] text-zinc-500">
                  <span>{dailyStats[0].date}</span>
                  {dailyStats.length > 2 && (
                    <span>{dailyStats[Math.floor(dailyStats.length / 2)].date}</span>
                  )}
                  <span>{dailyStats[dailyStats.length - 1].date}</span>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Reset */}
        <div className="animate-stagger" style={stagger(3)}>
          <Card variant="bordered">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-200">Reset Statistics</p>
                <p className="text-xs text-zinc-500 mt-0.5">Clear all collected usage data. This cannot be undone.</p>
              </div>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="w-3.5 h-3.5" />}
                onClick={() => setShowResetModal(true)}
              >
                Reset
              </Button>
            </div>
          </Card>
        </div>
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
