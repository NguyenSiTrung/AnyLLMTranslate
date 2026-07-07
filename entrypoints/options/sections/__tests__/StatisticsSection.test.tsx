import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatisticsSection } from '../StatisticsSection';
import { getStats, resetStats } from '@/services/statsCollector';
import { type TranslationStats } from '@/types/stats';

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
  vi.useFakeTimers({ toFake: ['Date'] });
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
});
