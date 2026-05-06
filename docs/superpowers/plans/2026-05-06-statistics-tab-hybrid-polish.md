# Statistics Tab Hybrid Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Settings → Statistics tab into a trustworthy, accessible, live-updating usage dashboard while preserving the existing Settings design language.

**Architecture:** Keep `StatisticsSection.tsx` as the UI orchestrator. Add a small pure helper module for display calculations, export the stats storage key from the collector, and keep presentational subcomponents local in `StatisticsSection.tsx`. Use TDD: utility tests first, service race test first, then component tests before UI implementation.

**Tech Stack:** React 19, TypeScript, WXT, Vitest, Testing Library, Chrome extension storage APIs, Tailwind CSS utilities, existing shared UI components.

---

## Important Working Tree Note

Before implementation, run:

```bash
git status --short
```

At plan creation time, unrelated unstaged changes existed in subtitle-related files and `ui/SegmentedControl.tsx`. Do not stage or commit those files while implementing this plan unless the user explicitly asks.

---

## File Structure

- Modify: `services/statsCollector.ts`
  - Export `STATS_STORAGE_KEY`.
  - Chain `resetStats()` through the existing serialized update queue.
- Modify: `services/__tests__/statsCollector.test.ts`
  - Add a regression test proving reset cannot race with pending stats writes.
- Create: `entrypoints/options/sections/statisticsDisplay.ts`
  - Pure helpers for 30-day zero-filled chart data, date formatting, cache hit rate, and empty-activity detection.
- Create: `entrypoints/options/sections/__tests__/statisticsDisplay.test.ts`
  - Unit tests for display helpers.
- Modify: `entrypoints/options/sections/StatisticsSection.tsx`
  - Add loading/error/resetting states, storage refresh listener, refined metrics, accessible chart, cache no-data state, and Danger Zone reset.
- Create: `entrypoints/options/sections/__tests__/StatisticsSection.test.tsx`
  - Component tests for loading, populated metrics, empty state, storage failure, reset flow, and storage change refresh.

---

## Task 1: Serialize Stats Reset

**Files:**
- Modify: `services/statsCollector.ts`
- Modify: `services/__tests__/statsCollector.test.ts`

- [ ] **Step 1: Write the failing reset race test**

Add this test inside `describe('resetStats', () => { ... })` in `services/__tests__/statsCollector.test.ts`:

```ts
    it('should serialize reset behind pending stat updates', async () => {
      // Arrange
      const setDeferred: Array<() => void> = [];
      const setMock = chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>;
      setMock.mockImplementation((items: Record<string, unknown>) => new Promise<void>((resolve) => {
        setDeferred.push(() => {
          Object.assign(mockStorage, items);
          resolve();
        });
      }));

      const incrementPromise = incrementStats({ totalApiCalls: 1, totalCharactersTranslated: 100 });
      const resetPromise = resetStats();

      // Act — allow the pending increment write, then await reset.
      setDeferred.shift()?.();
      await incrementPromise;
      await resetPromise;

      // Assert
      const stats = await getStats();
      expect(stats).toEqual(DEFAULT_STATS);
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('anyllm-translate-stats');
    });
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npx -y pnpm@latest exec vitest run services/__tests__/statsCollector.test.ts --runInBand
```

Expected: the new test fails because `resetStats()` is not chained behind pending updates.

- [ ] **Step 3: Implement serialized reset and exported key**

Update the top of `services/statsCollector.ts`:

```ts
import { DEFAULT_STATS, type TranslationStats } from '@/types/stats';

export const STATS_STORAGE_KEY = 'anyllm-translate-stats';
```

Replace `getStats()` and `resetStats()` with:

```ts
export async function getStats(): Promise<TranslationStats> {
  const result = await chrome.storage.local.get(STATS_STORAGE_KEY);
  return result[STATS_STORAGE_KEY] ?? { ...DEFAULT_STATS };
}

export async function resetStats(): Promise<void> {
  return chainUpdate(async () => {
    await chrome.storage.local.remove(STATS_STORAGE_KEY);
  });
}
```

Update the `recordDailyStats()` storage write key:

```ts
    await chrome.storage.local.set({
      [STATS_STORAGE_KEY]: { ...current, dailyStats: pruned },
    });
```

- [ ] **Step 4: Run the service tests**

Run:

```bash
npx -y pnpm@latest exec vitest run services/__tests__/statsCollector.test.ts --runInBand
```

Expected: all `statsCollector` tests pass.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add services/statsCollector.ts services/__tests__/statsCollector.test.ts
git diff --cached
git commit -m "fix(stats): serialize statistics reset"
```

Verify the staged diff contains only the two files above.

---

## Task 2: Add Statistics Display Helpers

**Files:**
- Create: `entrypoints/options/sections/statisticsDisplay.ts`
- Create: `entrypoints/options/sections/__tests__/statisticsDisplay.test.ts`

- [ ] **Step 1: Write the helper tests**

Create `entrypoints/options/sections/__tests__/statisticsDisplay.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildLast30Days,
  formatCompactDate,
  getCacheEfficiency,
  hasDailyActivity,
} from '../statisticsDisplay';

describe('statisticsDisplay', () => {
  describe('buildLast30Days', () => {
    it('returns exactly 30 chronological days with zero-filled gaps', () => {
      const days = buildLast30Days([
        { date: '2026-04-08', chars: 100, apiCalls: 1, cacheHits: 2 },
        { date: '2026-05-06', chars: 500, apiCalls: 3, cacheHits: 4 },
      ], new Date('2026-05-06T10:00:00Z'));

      expect(days).toHaveLength(30);
      expect(days[0]).toMatchObject({ date: '2026-04-07', chars: 0, apiCalls: 0, cacheHits: 0 });
      expect(days[1]).toMatchObject({ date: '2026-04-08', chars: 100, apiCalls: 1, cacheHits: 2 });
      expect(days[29]).toMatchObject({ date: '2026-05-06', chars: 500, apiCalls: 3, cacheHits: 4 });
    });

    it('ignores stored entries outside the 30-day display range', () => {
      const days = buildLast30Days([
        { date: '2026-04-01', chars: 999, apiCalls: 9, cacheHits: 9 },
      ], new Date('2026-05-06T10:00:00Z'));

      expect(days.some((day) => day.date === '2026-04-01')).toBe(false);
      expect(hasDailyActivity(days)).toBe(false);
    });
  });

  describe('formatCompactDate', () => {
    it('formats ISO date keys as compact localized dates', () => {
      expect(formatCompactDate('2026-05-06', 'en-US')).toBe('May 6');
    });
  });

  describe('getCacheEfficiency', () => {
    it('returns null hit rate when there is no cache activity', () => {
      expect(getCacheEfficiency(0, 0)).toEqual({ total: 0, hitRate: null });
    });

    it('rounds hit rate when cache activity exists', () => {
      expect(getCacheEfficiency(2, 1)).toEqual({ total: 3, hitRate: 67 });
    });
  });
});
```

- [ ] **Step 2: Run the failing helper tests**

Run:

```bash
npx -y pnpm@latest exec vitest run entrypoints/options/sections/__tests__/statisticsDisplay.test.ts --runInBand
```

Expected: fail because `statisticsDisplay.ts` does not exist.

- [ ] **Step 3: Implement the helper module**

Create `entrypoints/options/sections/statisticsDisplay.ts`:

```ts
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
```

- [ ] **Step 4: Run the helper tests**

Run:

```bash
npx -y pnpm@latest exec vitest run entrypoints/options/sections/__tests__/statisticsDisplay.test.ts --runInBand
```

Expected: all helper tests pass.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add entrypoints/options/sections/statisticsDisplay.ts entrypoints/options/sections/__tests__/statisticsDisplay.test.ts
git diff --cached
git commit -m "feat(stats): add statistics display helpers"
```

Verify the staged diff contains only the two files above.

---

## Task 3: Add StatisticsSection State Tests

**Files:**
- Create: `entrypoints/options/sections/__tests__/StatisticsSection.test.tsx`

- [ ] **Step 1: Write component tests for state and data behavior**

Create `entrypoints/options/sections/__tests__/StatisticsSection.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { StatisticsSection } from '../StatisticsSection';
import { getStats, resetStats, STATS_STORAGE_KEY } from '@/services/statsCollector';
import { DEFAULT_STATS, type TranslationStats } from '@/types/stats';

vi.mock('@/services/statsCollector', () => ({
  STATS_STORAGE_KEY: 'anyllm-translate-stats',
  getStats: vi.fn(),
  resetStats: vi.fn(),
}));

const populatedStats: TranslationStats = {
  totalCharactersTranslated: 12345,
  totalApiCalls: 12,
  totalCacheHits: 8,
  totalCacheMisses: 4,
  totalPagesTranslated: 3,
  totalSubtitlesCuesTranslated: 44,
  dailyStats: [
    { date: '2026-05-05', chars: 1000, apiCalls: 2, cacheHits: 3 },
    { date: '2026-05-06', chars: 2000, apiCalls: 4, cacheHits: 5 },
  ],
};

let storageListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-06T12:00:00Z'));
  storageListener = undefined;

  vi.stubGlobal('chrome', {
    storage: {
      onChanged: {
        addListener: vi.fn((listener) => {
          storageListener = listener;
        }),
        removeListener: vi.fn((listener) => {
          if (storageListener === listener) storageListener = undefined;
        }),
      },
    },
  });

  (getStats as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(populatedStats);
  (resetStats as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('StatisticsSection', () => {
  it('shows a loading state before stats resolve', () => {
    (getStats as unknown as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    render(<StatisticsSection />);

    expect(screen.getByText('Loading statistics...')).toBeInTheDocument();
  });

  it('renders populated metric labels and values after loading', async () => {
    render(<StatisticsSection />);

    expect(await screen.findByText('LLM Characters')).toBeInTheDocument();
    expect(screen.getByText('12,345')).toBeInTheDocument();
    expect(screen.getByText('LLM Requests')).toBeInTheDocument();
    expect(screen.getByText('Page Sessions')).toBeInTheDocument();
    expect(screen.getByText('Subtitle Cues')).toBeInTheDocument();
  });

  it('shows an inline retry error when stats fail to load', async () => {
    (getStats as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Storage unavailable'));

    render(<StatisticsSection />);

    expect(await screen.findByText('Unable to load statistics')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('refreshes when stats storage changes while the tab is open', async () => {
    render(<StatisticsSection />);
    expect(await screen.findByText('12,345')).toBeInTheDocument();

    storageListener?.({
      [STATS_STORAGE_KEY]: {
        oldValue: populatedStats,
        newValue: { ...populatedStats, totalApiCalls: 99 },
      },
    }, 'local');

    expect(await screen.findByText('99')).toBeInTheDocument();
  });

  it('uses a neutral cache empty state when there is no cache activity', async () => {
    (getStats as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...DEFAULT_STATS,
      dailyStats: [],
    });

    render(<StatisticsSection />);

    expect(await screen.findByText('No cache activity yet')).toBeInTheDocument();
  });

  it('shows accessible daily activity bars for the 30-day range', async () => {
    render(<StatisticsSection />);

    expect(await screen.findByLabelText('May 6, 2026: 2,000 characters, 4 LLM requests, 5 cache hits')).toBeInTheDocument();
  });

  it('resets stats through the confirmation modal', async () => {
    render(<StatisticsSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reset Statistics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() => expect(resetStats).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('0')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the failing component tests**

Run:

```bash
npx -y pnpm@latest exec vitest run entrypoints/options/sections/__tests__/StatisticsSection.test.tsx --runInBand
```

Expected: tests fail because `StatisticsSection` does not yet expose the new labels, states, storage listener, accessible bars, and reset behavior.

- [ ] **Step 3: Keep the failing component tests unstaged**

Do not commit the failing component test file yet. It will be committed with the Task 4 implementation after the tests pass.

---

## Task 4: Implement StatisticsSection Hybrid Polish

**Files:**
- Modify: `entrypoints/options/sections/StatisticsSection.tsx`
- Modify: `entrypoints/options/sections/__tests__/StatisticsSection.test.tsx`

- [ ] **Step 1: Update imports**

In `entrypoints/options/sections/StatisticsSection.tsx`, replace the current imports with this set:

```tsx
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
```

- [ ] **Step 2: Add local helper components above `StatisticsSection`**

Add these helpers below `formatNumber`:

```tsx
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
              <button
                type="button"
                aria-label={label}
                className="absolute bottom-0 left-0 right-0 rounded-t bg-blue-500 transition-all duration-200 group-hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
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
  const { total, hitRate } = getCacheEfficiency(hits, misses);
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
              <p className="text-lg font-semibold text-zinc-100">{formatNumber(total)}</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Replace component state and data loading**

Inside `StatisticsSection`, replace the current state and load/reset functions with:

```tsx
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
```

- [ ] **Step 4: Add memoized derived values**

Below `handleReset`, add:

```tsx
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
```

- [ ] **Step 5: Replace the return body content**

Keep the existing outer `<div className="animate-fade-in-up">` and `SectionHeader`. Replace the content inside `<div className="space-y-4">` with:

```tsx
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
```

Keep the existing modal block, but pass the resetting state through the confirm path by leaving `onConfirm={handleReset}` and keeping `variant="danger"`.

- [ ] **Step 6: Run StatisticsSection tests**

Run:

```bash
npx -y pnpm@latest exec vitest run entrypoints/options/sections/__tests__/StatisticsSection.test.tsx --runInBand
```

Expected: all `StatisticsSection` tests pass. If the reset test finds multiple `0` text nodes, update the assertion to target the `LLM Characters` card value through nearby text rather than a global `findByText('0')`.

- [ ] **Step 7: Commit Task 4**

```bash
git add entrypoints/options/sections/StatisticsSection.tsx entrypoints/options/sections/__tests__/StatisticsSection.test.tsx
git diff --cached
git commit -m "feat(stats): polish Statistics section dashboard"
```

Verify the staged diff does not include unrelated subtitle or SegmentedControl files.

---

## Task 5: Integration Verification and Final Cleanup

**Files:**
- Modify only files already touched by Tasks 1-4 if failures require fixes.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npx -y pnpm@latest exec vitest run \
  services/__tests__/statsCollector.test.ts \
  entrypoints/options/sections/__tests__/statisticsDisplay.test.ts \
  entrypoints/options/sections/__tests__/StatisticsSection.test.tsx \
  --runInBand
```

Expected: all targeted tests pass.

- [ ] **Step 2: Run type checking**

Run:

```bash
npx -y pnpm@latest run compile
```

Expected: TypeScript exits with code 0.

- [ ] **Step 3: Run lint**

Run:

```bash
npx -y pnpm@latest run lint
```

Expected: no lint errors. If pre-existing warnings appear outside touched files, record them in the handoff but do not modify unrelated files.

- [ ] **Step 4: Run the full test suite**

Run:

```bash
npx -y pnpm@latest test
```

Expected: all tests pass.

- [ ] **Step 5: Review final diff**

Run:

```bash
git status --short
git diff
```

Expected touched files for this plan:

```text
services/statsCollector.ts
services/__tests__/statsCollector.test.ts
entrypoints/options/sections/statisticsDisplay.ts
entrypoints/options/sections/__tests__/statisticsDisplay.test.ts
entrypoints/options/sections/StatisticsSection.tsx
entrypoints/options/sections/__tests__/StatisticsSection.test.tsx
```

Unrelated subtitle and SegmentedControl changes may still be present from before this work. Do not stage them.

- [ ] **Step 6: Commit final verification fixes if needed**

If Task 5 required edits, run:

```bash
git add services/statsCollector.ts services/__tests__/statsCollector.test.ts \
  entrypoints/options/sections/statisticsDisplay.ts \
  entrypoints/options/sections/__tests__/statisticsDisplay.test.ts \
  entrypoints/options/sections/StatisticsSection.tsx \
  entrypoints/options/sections/__tests__/StatisticsSection.test.tsx
git diff --cached
git commit -m "fix(stats): finalize Statistics tab polish"
```

Skip this commit if there are no Task 5 edits after prior task commits.

---

## Self-Review Checklist

- Spec coverage:
  - Loading/error/resetting states: Task 3 tests and Task 4 implementation.
  - Storage live updates: Task 3 listener test and Task 4 listener implementation.
  - Reset race: Task 1 test and implementation.
  - 30-day chart: Task 2 helpers/tests and Task 4 chart.
  - Accessibility: Task 3 accessible bar test and Task 4 `aria-label`/focus implementation.
  - Cache no-data state: Task 2 cache helper and Task 4 `CacheEfficiencyCard`.
  - Metric labels: Task 4 metric config.
  - Responsiveness: Task 4 responsive grid classes.
- Red-flag scan: no deferred implementation steps.
- Type consistency:
  - `STATS_STORAGE_KEY` is exported from `services/statsCollector.ts` and imported by `StatisticsSection`.
  - `DisplayDailyStat` is exported from `statisticsDisplay.ts` and consumed by the local chart component.
  - Tests use `TranslationStats` and `DEFAULT_STATS` from `types/stats.ts`.
