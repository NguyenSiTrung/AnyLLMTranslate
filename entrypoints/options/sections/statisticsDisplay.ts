import type { DailyStat, DailyStatRecord } from '@/types/stats';
import { listPeriodDates, type StatsPeriod } from '@/services/statsQuery';

const DAY_MS = 24 * 60 * 60 * 1000;
const DISPLAY_WINDOW_DAYS = 30;

export interface DisplayDailyStat extends DailyStat {
  label: string;
  fullLabel: string;
}

export interface CacheEfficiency {
  totalOps: number;
  hitRate: number | null;
}

function dateKeyFromUtcTime(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function utcStartOfDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseDateKey(dateKey: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error(`Invalid dateKey format: expected YYYY-MM-DD, got "${dateKey}"`);
  }
  return new Date(`${dateKey}T12:00:00Z`);
}

/** Local calendar YYYY-MM-DD (matches statsQuery / recordUsage keys). */
function localDateYmd(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

function parseLocalDateKey(dateKey: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error(`Invalid dateKey format: expected YYYY-MM-DD, got "${dateKey}"`);
  }
  const [y, m, day] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, day);
}

/** Inclusive local-calendar date range as YYYY-MM-DD strings. */
function enumerateLocalDatesInclusive(startYmd: string, endYmd: string): string[] {
  const cur = parseLocalDateKey(startYmd);
  const end = parseLocalDateKey(endYmd);
  if (cur.getTime() > end.getTime()) return [];

  const dates: string[] = [];
  while (cur.getTime() <= end.getTime()) {
    dates.push(localDateYmd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function toDisplayDay(
  date: string,
  record: DailyStatRecord | undefined,
  locale: string,
): DisplayDailyStat {
  const totals = record?.totals;
  return {
    date,
    chars: totals?.characters ?? 0,
    apiCalls: totals?.apiCalls ?? 0,
    cacheHits: totals?.cacheHits ?? 0,
    label: formatCompactDate(date, locale),
    fullLabel: formatFullDate(date, locale),
  };
}

function trimTrailingZero(fixed: string): string {
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

export function formatCompactDate(dateKey: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(parseDateKey(dateKey));
}

export function formatFullDate(dateKey: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseDateKey(dateKey));
}

/**
 * Legacy v1 helper: last 30 UTC calendar days from DailyStat[].
 * Prefer buildChartDays for stats v2 period charts.
 */
export function buildLast30Days(
  dailyStats: DailyStat[],
  now = new Date(),
  locale = 'en-US',
): DisplayDailyStat[] {
  const byDate = new Map(dailyStats.map((day) => [day.date, day]));
  const end = utcStartOfDay(now);

  return Array.from({ length: DISPLAY_WINDOW_DAYS }, (_, index) => {
    const date = dateKeyFromUtcTime(end - (DISPLAY_WINDOW_DAYS - 1 - index) * DAY_MS);
    const stored = byDate.get(date);

    return {
      date,
      chars: stored?.chars ?? 0,
      apiCalls: stored?.apiCalls ?? 0,
      cacheHits: stored?.cacheHits ?? 0,
      label: formatCompactDate(date, locale),
      fullLabel: formatFullDate(date, locale),
    };
  });
}

/**
 * Zero-filled chart series for a dashboard period.
 * - 7d / 30d / 90d: last N local calendar days including today
 * - all: inclusive span from earliest to latest retained day (empty if none)
 *
 * Maps DailyStatRecord.totals → DisplayDailyStat chart fields
 * (characters → chars for bar height compatibility).
 */
export function buildChartDays(
  daily: DailyStatRecord[],
  period: StatsPeriod,
  now: Date = new Date(),
  locale = 'en-US',
): DisplayDailyStat[] {
  const byDate = new Map(daily.map((day) => [day.date, day]));

  let dates: string[];
  if (period === 'all') {
    if (byDate.size === 0) return [];
    const sorted = [...byDate.keys()].sort();
    dates = enumerateLocalDatesInclusive(sorted[0], sorted[sorted.length - 1]);
  } else {
    dates = listPeriodDates(period, now);
  }

  return dates.map((date) => toDisplayDay(date, byDate.get(date), locale));
}

/** 1200 → "1.2K"; 1000 → "1K"; values under 1000 stay unabbreviated. */
export function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';

  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);

  if (abs < 1000) {
    return `${sign}${Math.round(abs)}`;
  }
  if (abs < 1_000_000) {
    return `${sign}${trimTrailingZero((abs / 1000).toFixed(1))}K`;
  }
  if (abs < 1_000_000_000) {
    return `${sign}${trimTrailingZero((abs / 1_000_000).toFixed(1))}M`;
  }
  return `${sign}${trimTrailingZero((abs / 1_000_000_000).toFixed(1))}B`;
}

/** null → "—"; positive → "+12%"; negative → "-5%"; zero → "0%". */
export function formatDelta(delta: number | null): string {
  if (delta === null || !Number.isFinite(delta)) return '—';
  const rounded = Math.round(delta);
  if (rounded > 0) return `+${rounded}%`;
  return `${rounded}%`;
}

export function hasDailyActivity(days: DailyStat[]): boolean {
  return days.some((day) => day.chars > 0 || day.apiCalls > 0 || day.cacheHits > 0);
}

export function getCacheEfficiency(hits: number, misses: number): CacheEfficiency {
  if (hits < 0 || misses < 0) {
    return { totalOps: 0, hitRate: null };
  }
  const totalOps = hits + misses;
  return {
    totalOps,
    hitRate: totalOps > 0 ? Math.round((hits / totalOps) * 100) : null,
  };
}
