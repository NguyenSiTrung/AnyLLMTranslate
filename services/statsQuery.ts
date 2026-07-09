/**
 * Stats v2 query helpers: period windows, aggregates, top-N, insights.
 */

import {
  ZERO_COUNTERS,
  type DailyStatRecord,
  type StatCounters,
} from '@/types/stats';
import { mergeCounters } from '@/services/statsCounters';
import { getAllDailyRecords, getDailyRecord } from '@/services/statsIdb';

export type StatsPeriod = '7d' | '30d' | '90d' | 'all';

const PERIOD_DAYS: Record<Exclude<StatsPeriod, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/** Local calendar date as YYYY-MM-DD (matches recordUsage day keys). */
function localDateYmd(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

function addLocalDays(base: Date, deltaDays: number): Date {
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  next.setDate(next.getDate() + deltaDays);
  return next;
}

function datesForWindow(endInclusive: Date, length: number): string[] {
  if (length <= 0) return [];
  const dates: string[] = [];
  for (let i = length - 1; i >= 0; i--) {
    dates.push(localDateYmd(addLocalDays(endInclusive, -i)));
  }
  return dates;
}

/** Last N local calendar days including today; empty for `all`. */
export function listPeriodDates(period: StatsPeriod, now: Date = new Date()): string[] {
  if (period === 'all') return [];
  return datesForWindow(now, PERIOD_DAYS[period]);
}

/** Prior window of equal length ending the day before the current period starts. */
export function previousPeriodDates(
  period: StatsPeriod,
  now: Date = new Date(),
): string[] {
  if (period === 'all') return [];
  const n = PERIOD_DAYS[period];
  // Current window: [now-(n-1) .. now]. Previous ends at now-n.
  const previousEnd = addLocalDays(now, -n);
  return datesForWindow(previousEnd, n);
}

export function sumCounters(days: DailyStatRecord[]): StatCounters {
  return days.reduce(
    (acc, day) => mergeCounters(acc, day.totals),
    { ...ZERO_COUNTERS },
  );
}

/** Lifetime for `all`; otherwise sum of the provided day records. */
export function sumLifetimeOrDays(
  lifetime: StatCounters,
  days: DailyStatRecord[],
  period: StatsPeriod,
): StatCounters {
  if (period === 'all') return { ...lifetime };
  return sumCounters(days);
}

/**
 * Percent change from previous → current.
 * - both 0 → null (undefined delta)
 * - previous 0, current > 0 → 100
 * - otherwise ((current - previous) / previous) * 100
 */
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) {
    if (current === 0) return null;
    return 100;
  }
  return ((current - previous) / previous) * 100;
}

/**
 * Merge dimension maps across days and return top-N keys by the given metric.
 */
export function topEntries(
  maps: Array<Record<string, Partial<StatCounters>>>,
  metric: keyof StatCounters,
  n: number,
): Array<{ key: string; value: number }> {
  const totals = new Map<string, number>();
  for (const map of maps) {
    for (const [key, partial] of Object.entries(map)) {
      const value = partial[metric] ?? 0;
      totals.set(key, (totals.get(key) ?? 0) + value);
    }
  }

  return [...totals.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key))
    .slice(0, Math.max(0, n));
}

/**
 * Derive up to 3 short insight strings for the dashboard chips.
 * Mentions cache efficiency when hits+misses > 0.
 */
export function buildInsights(
  periodTotals: StatCounters,
  peakDate: string | null,
): string[] {
  const insights: string[] = [];

  const lookups = periodTotals.cacheHits + periodTotals.cacheMisses;
  if (lookups > 0) {
    const hitRate = Math.round((periodTotals.cacheHits / lookups) * 100);
    insights.push(
      `Cache served ${hitRate}% of lookups (${periodTotals.cacheHits.toLocaleString()} of ${lookups.toLocaleString()})`,
    );
  }

  if (peakDate) {
    insights.push(`Peak activity day: ${peakDate}`);
  }

  if (periodTotals.characters > 0) {
    insights.push(
      `${periodTotals.characters.toLocaleString()} characters translated in this period`,
    );
  }

  return insights.slice(0, 3);
}

/**
 * Load daily records for the period from IDB.
 * `all` → every stored day; finite periods → only existing days in the date window
 * (missing days are not zero-filled here — display layer handles charts).
 */
export async function loadDaysForPeriod(
  period: StatsPeriod,
  now: Date = new Date(),
): Promise<DailyStatRecord[]> {
  if (period === 'all') {
    return getAllDailyRecords();
  }

  const dates = listPeriodDates(period, now);
  const days: DailyStatRecord[] = [];
  for (const date of dates) {
    const record = await getDailyRecord(date);
    if (record) days.push(record);
  }
  return days;
}
