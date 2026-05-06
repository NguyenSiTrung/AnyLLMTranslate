import type { DailyStat } from '@/types/stats';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DisplayDailyStat extends DailyStat {
  label: string;
  fullLabel: string;
}

export interface CacheEfficiency {
  total: number;
  hitRate: number | null;
}

function dateKeyFromUtcTime(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function utcStartOfDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseDateKey(dateKey: string): Date {
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

  return Array.from({ length: 30 }, (_, index) => {
    const date = dateKeyFromUtcTime(end - (29 - index) * DAY_MS);
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
  const total = hits + misses;
  return {
    total,
    hitRate: total > 0 ? Math.round((hits / total) * 100) : null,
  };
}
