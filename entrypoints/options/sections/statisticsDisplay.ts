import type { DailyStat } from '@/types/stats';

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
