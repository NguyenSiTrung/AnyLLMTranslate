/**
 * StatisticsSection — dashboard: loading, empty, error, period, KPIs,
 * host-off CTA, export, reset modal, retention preference.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { ZERO_COUNTERS, type DailyStatRecord, type TranslationStatsV2 } from '@/types/stats';
import type * as StatsQuery from '@/services/statsQuery';

vi.mock('@/services/statsCollector', () => ({
  getStatsV2: vi.fn(),
  resetStats: vi.fn(),
  updateStatsPreferences: vi.fn(),
  STATS_STORAGE_KEY: 'anyllm-translate-stats',
}));

vi.mock('@/services/statsQuery', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof StatsQuery;
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

vi.mock('@/services/statsExport', () => ({
  buildStatsJsonExport: vi.fn(() => '{"lifetime":{}}'),
  buildStatsCsvExport: vi.fn(() => 'date,characters\n'),
  triggerDownload: vi.fn(),
}));

import {
  getStatsV2,
  resetStats,
  updateStatsPreferences,
  STATS_STORAGE_KEY,
} from '@/services/statsCollector';
import {
  loadDaysForPeriod,
  sumLifetimeOrDays,
  percentDelta,
  previousPeriodDates,
  sumCounters,
  topEntries,
  buildInsights,
} from '@/services/statsQuery';
import {
  buildStatsJsonExport,
  buildStatsCsvExport,
  triggerDownload,
} from '@/services/statsExport';
import { StatisticsSection } from '../StatisticsSection';

const mockedGetStatsV2 = vi.mocked(getStatsV2);
const mockedLoadDays = vi.mocked(loadDaysForPeriod);
const mockedSumLifetimeOrDays = vi.mocked(sumLifetimeOrDays);
const mockedPercentDelta = vi.mocked(percentDelta);
const mockedPreviousPeriodDates = vi.mocked(previousPeriodDates);
const mockedSumCounters = vi.mocked(sumCounters);
const mockedResetStats = vi.mocked(resetStats);
const mockedUpdatePrefs = vi.mocked(updateStatsPreferences);
const mockedTopEntries = vi.mocked(topEntries);
const mockedBuildInsights = vi.mocked(buildInsights);
const mockedBuildJson = vi.mocked(buildStatsJsonExport);
const mockedBuildCsv = vi.mocked(buildStatsCsvExport);
const mockedTriggerDownload = vi.mocked(triggerDownload);

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
    byMode: { page: { characters: Math.floor(characters * 0.6) }, subtitle: { characters: Math.floor(characters * 0.4) } },
    byProvider: { openai: { characters } },
    byHost: { 'example.com': { characters } },
    byLanguagePair: { 'en>vi': { characters } },
  };
}

function setupPopulatedMocks(summaryOverrides: Partial<TranslationStatsV2> = {}) {
  const summary = makeSummary(summaryOverrides);
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
  mockedTopEntries.mockImplementation((maps, _metric, n) => {
    const first = maps[0] ?? {};
    return Object.entries(first)
      .map(([key, partial]) => ({ key, value: partial?.characters ?? 0 }))
      .slice(0, n);
  });
  mockedBuildInsights.mockReturnValue([
    'Cache served 67% of lookups (4 of 6)',
    'Peak activity day: 2026-07-09',
  ]);
  mockedUpdatePrefs.mockResolvedValue(undefined);

  return { summary, days, totals };
}

describe('StatisticsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPreviousPeriodDates.mockReturnValue([]);
    mockedSumCounters.mockReturnValue({ ...ZERO_COUNTERS });
    mockedPercentDelta.mockReturnValue(null);
    mockedResetStats.mockResolvedValue(undefined);
    mockedUpdatePrefs.mockResolvedValue(undefined);
    mockedTopEntries.mockReturnValue([]);
    mockedBuildInsights.mockReturnValue([]);
    mockedBuildJson.mockReturnValue('{"lifetime":{}}');
    mockedBuildCsv.mockReturnValue('date,characters\n');
  });

  it('loading skeleton → KPIs; empty guidance; error + retry', async () => {
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

    const { unmount } = render(<StatisticsSection />);

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
    unmount();

    // Empty
    mockedGetStatsV2.mockResolvedValue(
      makeSummary({
        lifetime: { ...ZERO_COUNTERS },
        lastActiveAt: null,
      }),
    );
    mockedLoadDays.mockResolvedValue([]);
    mockedSumLifetimeOrDays.mockReturnValue({ ...ZERO_COUNTERS });
    mockedPercentDelta.mockReturnValue(null);

    const { unmount: unmount2 } = render(<StatisticsSection />);
    await waitFor(() => {
      expect(screen.getByTestId('stats-empty-state')).toBeInTheDocument();
    });
    expect(screen.getByText(/start translating/i)).toBeInTheDocument();
    expect(screen.queryByText('LLM Characters')).not.toBeInTheDocument();
    unmount2();

    // Error + retry
    const callsBeforeError = mockedGetStatsV2.mock.calls.length;
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
    // Initial failed load + retry
    expect(mockedGetStatsV2.mock.calls.length).toBe(callsBeforeError + 2);
  });

  it('period/export/host-off/retention/reset/insights interactions', async () => {
    const { summary, days } = setupPopulatedMocks();
    const { unmount } = render(<StatisticsSection />);

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

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    const jsonItem = await screen.findByRole('menuitem', { name: /export json/i });
    fireEvent.click(jsonItem);
    expect(mockedBuildJson).toHaveBeenCalledWith({ summary, daily: days });
    expect(mockedTriggerDownload).toHaveBeenCalledWith(
      expect.stringMatching(/^anyllm-stats-\d{4}-\d{2}-\d{2}\.json$/),
      '{"lifetime":{}}',
      'application/json',
    );
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    const csvItem = await screen.findByRole('menuitem', { name: /export csv/i });
    fireEvent.click(csvItem);
    expect(mockedBuildCsv).toHaveBeenCalledWith(days);
    expect(mockedTriggerDownload).toHaveBeenCalledWith(
      expect.stringMatching(/^anyllm-stats-daily-\d{4}-\d{2}-\d{2}\.csv$/),
      'date,characters\n',
      'text/csv',
    );

    await waitFor(() => {
      expect(screen.getByTestId('stats-insights')).toBeInTheDocument();
    });
    expect(screen.getByText(/cache served 67%/i)).toBeInTheDocument();
    expect(mockedBuildInsights).toHaveBeenCalled();
    expect(screen.getByTestId('stats-breakdowns')).toBeInTheDocument();
    expect(screen.getByText('By mode')).toBeInTheDocument();
    expect(screen.getByText('Top hosts')).toBeInTheDocument();
    expect(screen.getByTestId('stats-data-controls')).toBeInTheDocument();
    expect(screen.getByText(/statistics stay on this device/i)).toBeInTheDocument();

    const select = screen.getByLabelText(/daily detail retention/i);
    fireEvent.change(select, { target: { value: '30' } });
    await waitFor(() => {
      expect(mockedUpdatePrefs).toHaveBeenCalledWith({ retentionDays: 30 });
    });

    // Reset confirm
    fireEvent.click(screen.getByRole('button', { name: /reset statistics/i }));
    await waitFor(() => {
      expect(screen.getByText(/reset usage statistics\?/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/translation cache is not affected/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /keep statistics/i }));
    await waitFor(() => {
      expect(screen.queryByText(/reset usage statistics\?/i)).not.toBeInTheDocument();
    });
    expect(mockedResetStats).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /reset statistics/i }));
    await waitFor(() => {
      expect(screen.getByText(/reset usage statistics\?/i)).toBeInTheDocument();
    });
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /reset statistics/i }));
    await waitFor(() => {
      expect(mockedResetStats).toHaveBeenCalled();
    });
    unmount();

    // Host-off CTA
    setupPopulatedMocks({
      preferences: { hostTrackingEnabled: false, retentionDays: 90 },
    });
    render(<StatisticsSection />);
    await waitFor(() => {
      expect(screen.getByTestId('stats-host-off-cta')).toBeInTheDocument();
    });
    expect(screen.getByText(/host tracking is off/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /enable host tracking/i }));
    await waitFor(() => {
      expect(mockedUpdatePrefs).toHaveBeenCalledWith({ hostTrackingEnabled: true });
    });
  });

  it('storage onChanged soft-reloads without skeleton flash', async () => {
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

    let resolveStats!: (value: TranslationStatsV2) => void;
    mockedGetStatsV2.mockReturnValue(
      new Promise((resolve) => {
        resolveStats = resolve;
      }),
    );
    mockedLoadDays.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      listener(
        { [STATS_STORAGE_KEY]: { newValue: makeSummary() } },
        'local',
      );
    });

    expect(screen.queryByTestId('stats-loading-skeleton')).not.toBeInTheDocument();
    expect(screen.getByText('LLM Characters')).toBeInTheDocument();
    resolveStats(makeSummary());
  });
});
