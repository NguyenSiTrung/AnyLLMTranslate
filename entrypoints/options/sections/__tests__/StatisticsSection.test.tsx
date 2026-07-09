/**
 * StatisticsSection — dashboard shell: loading, empty, error, period control, KPIs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ZERO_COUNTERS, type DailyStatRecord, type TranslationStatsV2 } from '@/types/stats';

vi.mock('@/services/statsCollector', () => ({
  getStatsV2: vi.fn(),
  resetStats: vi.fn(),
  updateStatsPreferences: vi.fn(),
  STATS_STORAGE_KEY: 'anyllm-translate-stats',
}));

vi.mock('@/services/statsQuery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/statsQuery')>();
  return {
    ...actual,
    loadDaysForPeriod: vi.fn(),
    sumLifetimeOrDays: vi.fn(),
    percentDelta: vi.fn(),
    previousPeriodDates: vi.fn(),
    topEntries: vi.fn(),
    buildInsights: vi.fn(() => []),
    sumCounters: vi.fn(),
  };
});

vi.mock('@/services/statsIdb', () => ({
  getDailyRecord: vi.fn(async () => undefined),
}));

import { getStatsV2, resetStats, STATS_STORAGE_KEY } from '@/services/statsCollector';
import {
  loadDaysForPeriod,
  sumLifetimeOrDays,
  percentDelta,
  previousPeriodDates,
  sumCounters,
} from '@/services/statsQuery';
import { StatisticsSection } from '../StatisticsSection';

const mockedGetStatsV2 = vi.mocked(getStatsV2);
const mockedLoadDays = vi.mocked(loadDaysForPeriod);
const mockedSumLifetimeOrDays = vi.mocked(sumLifetimeOrDays);
const mockedPercentDelta = vi.mocked(percentDelta);
const mockedPreviousPeriodDates = vi.mocked(previousPeriodDates);
const mockedSumCounters = vi.mocked(sumCounters);
const mockedResetStats = vi.mocked(resetStats);

function makeSummary(overrides: Partial<TranslationStatsV2> = {}): TranslationStatsV2 {
  return {
    version: 2,
    trackingSince: '2026-01-01T00:00:00.000Z',
    lastActiveAt: '2026-07-09T12:00:00.000Z',
    lifetime: { ...ZERO_COUNTERS, characters: 1200, apiCalls: 40, cacheHits: 10, cacheMisses: 5 },
    recentDailySummary: [],
    preferences: { hostTrackingEnabled: true, retentionDays: 90 },
    ...overrides,
  };
}

function makeDay(date: string, characters = 100): DailyStatRecord {
  return {
    date,
    totals: { ...ZERO_COUNTERS, characters, apiCalls: 2, cacheHits: 1 },
    byMode: {},
    byProvider: {},
    byHost: {},
    byLanguagePair: {},
  };
}

function setupPopulatedMocks() {
  const summary = makeSummary();
  const days = [makeDay('2026-07-08'), makeDay('2026-07-09', 200)];
  const totals = {
    ...ZERO_COUNTERS,
    characters: 300,
    apiCalls: 12,
    cacheHits: 4,
    cacheMisses: 2,
    cacheCharacters: 80,
    pageSessions: 3,
    subtitleCues: 15,
    selectionEvents: 5,
  };

  mockedGetStatsV2.mockResolvedValue(summary);
  mockedLoadDays.mockResolvedValue(days);
  mockedSumLifetimeOrDays.mockReturnValue(totals);
  mockedPreviousPeriodDates.mockReturnValue([]);
  mockedSumCounters.mockReturnValue({ ...ZERO_COUNTERS });
  mockedPercentDelta.mockReturnValue(25);

  return { summary, days, totals };
}

describe('StatisticsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPreviousPeriodDates.mockReturnValue([]);
    mockedSumCounters.mockReturnValue({ ...ZERO_COUNTERS });
    mockedPercentDelta.mockReturnValue(null);
    mockedResetStats.mockResolvedValue(undefined);
  });

  it('shows loading skeleton then KPIs after load', async () => {
    let resolveStats!: (value: TranslationStatsV2) => void;
    let resolveDays!: (value: DailyStatRecord[]) => void;

    const summary = makeSummary();
    const days = [makeDay('2026-07-09', 200)];
    const totals = {
      ...ZERO_COUNTERS,
      characters: 200,
      apiCalls: 8,
      cacheHits: 3,
      cacheMisses: 1,
      cacheCharacters: 50,
      pageSessions: 2,
      subtitleCues: 9,
      selectionEvents: 4,
    };

    mockedGetStatsV2.mockReturnValue(
      new Promise((resolve) => {
        resolveStats = resolve;
      }),
    );
    mockedLoadDays.mockReturnValue(
      new Promise((resolve) => {
        resolveDays = resolve;
      }),
    );
    mockedSumLifetimeOrDays.mockReturnValue(totals);
    mockedPercentDelta.mockReturnValue(10);

    render(<StatisticsSection />);

    expect(screen.getByTestId('stats-loading-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('LLM Characters')).not.toBeInTheDocument();

    resolveStats(summary);
    resolveDays(days);

    await waitFor(() => {
      expect(screen.getByText('LLM Characters')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('stats-loading-skeleton')).not.toBeInTheDocument();
    expect(screen.getByText('API Calls')).toBeInTheDocument();
    expect(screen.getByText('Cache Characters')).toBeInTheDocument();
    expect(screen.getByText('Page Sessions')).toBeInTheDocument();
    expect(screen.getByText('Subtitle Cues')).toBeInTheDocument();
    expect(screen.getByText('Selection Events')).toBeInTheDocument();
  });

  it('shows empty guidance when lifetime zero and no days', async () => {
    mockedGetStatsV2.mockResolvedValue(
      makeSummary({
        lifetime: { ...ZERO_COUNTERS },
        lastActiveAt: null,
      }),
    );
    mockedLoadDays.mockResolvedValue([]);
    mockedSumLifetimeOrDays.mockReturnValue({ ...ZERO_COUNTERS });
    mockedPercentDelta.mockReturnValue(null);

    render(<StatisticsSection />);

    await waitFor(() => {
      expect(screen.getByTestId('stats-empty-state')).toBeInTheDocument();
    });

    expect(screen.getByText(/start translating/i)).toBeInTheDocument();
    expect(screen.queryByText('LLM Characters')).not.toBeInTheDocument();
  });

  it('shows error and retry', async () => {
    mockedGetStatsV2.mockRejectedValue(new Error('storage failed'));
    mockedLoadDays.mockResolvedValue([]);

    render(<StatisticsSection />);

    await waitFor(() => {
      expect(screen.getByText(/unable to load statistics/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();

    setupPopulatedMocks();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText('LLM Characters')).toBeInTheDocument();
    });
    expect(mockedGetStatsV2).toHaveBeenCalledTimes(2);
  });

  it('renders period radiogroup', async () => {
    setupPopulatedMocks();

    render(<StatisticsSection />);

    await waitFor(() => {
      expect(screen.getByRole('radiogroup', { name: /period/i })).toBeInTheDocument();
    });

    for (const label of ['7d', '30d', '90d', 'All']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }

    expect(screen.getByRole('radio', { name: '30d' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('radio', { name: '7d' }));

    await waitFor(() => {
      expect(mockedLoadDays).toHaveBeenCalledWith('7d');
    });
  });

  it('renders export placeholder as disabled', async () => {
    setupPopulatedMocks();
    render(<StatisticsSection />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
    });
  });

  it('keeps reset danger action available', async () => {
    setupPopulatedMocks();
    render(<StatisticsSection />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reset statistics/i })).toBeInTheDocument();
    });
  });

  it('subscribes to chrome.storage onChanged for stats key', async () => {
    setupPopulatedMocks();
    render(<StatisticsSection />);

    await waitFor(() => {
      expect(screen.getByText('LLM Characters')).toBeInTheDocument();
    });

    expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
    const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0][0];

    const nextSummary = makeSummary({
      lifetime: { ...ZERO_COUNTERS, characters: 9999, apiCalls: 1 },
    });
    mockedSumLifetimeOrDays.mockReturnValue({
      ...ZERO_COUNTERS,
      characters: 9999,
      apiCalls: 1,
      cacheCharacters: 1,
      pageSessions: 1,
      subtitleCues: 1,
      selectionEvents: 1,
    });
    mockedLoadDays.mockResolvedValue([makeDay('2026-07-09', 9999)]);

    await act(async () => {
      listener(
        { [STATS_STORAGE_KEY]: { newValue: nextSummary } },
        'local',
      );
    });

    await waitFor(() => {
      expect(mockedLoadDays.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
