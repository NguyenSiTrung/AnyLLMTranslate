/**
 * Tests: Performance card — cache health, common limits, collapsed custom
 * tuning, and confirmed cache clearing (moved out of the Danger Zone).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { ToastProvider } from '@/ui/ToastProvider';
import { PerformanceCard } from '../PerformanceCard';

const cacheStats = vi.hoisted(() => ({
  entryCount: 12,
  totalSizeBytes: 2048,
  sizeMb: 0.002,
  sizeLabel: '2 KB',
  loading: false,
  refresh: vi.fn(),
}));

const sendMessage = vi.hoisted(() => vi.fn());

vi.mock('@/entrypoints/options/hooks/useCacheStats', () => ({
  useCacheStats: () => cacheStats,
}));

function renderPerformance(overrides: Partial<ExtensionSettings> = {}) {
  const updateSettings = vi.fn();
  useSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    ...overrides,
    isLoaded: true,
    updateSettings,
  } as never);
  render(
    <ToastProvider>
      <PerformanceCard />
    </ToastProvider>,
  );
  return { updateSettings };
}

describe('PerformanceCard', () => {
  beforeEach(() => {
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({ success: true });
    cacheStats.entryCount = 12;
    cacheStats.loading = false;
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage,
        getURL: vi.fn((path: string) => path),
        getManifest: vi.fn(() => ({ version: '0.0.0' })),
      },
    });
  });

  it('shows cache health and common limits before custom tuning', () => {
    renderPerformance();
    expect(screen.getByText(/12 entries/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cache lifetime/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/provider requests per minute/i),
    ).toBeInTheDocument();
    const disclosure = screen.getByRole('button', {
      name: /custom performance tuning/i,
    });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByLabelText(/maximum pieces per request/i),
    ).not.toBeInTheDocument();
  });

  it('keeps cache clearing in Performance behind confirmation', async () => {
    renderPerformance();
    fireEvent.click(screen.getByRole('button', { name: /^clear cache$/i }));
    const dialog = screen.getByRole('dialog', {
      name: /clear translation cache/i,
    });
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear cache' }));
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ action: 'CLEAR_CACHE' }),
    );
  });

  it('does not persist an invalid cache lifetime', () => {
    const { updateSettings } = renderPerformance();
    const ttl = screen.getByLabelText(/cache lifetime/i);
    fireEvent.change(ttl, { target: { value: '0' } });
    fireEvent.blur(ttl);
    expect(screen.getByText(/between 1 and 365 days/i)).toBeInTheDocument();
    expect(updateSettings).not.toHaveBeenCalledWith({ cacheTTLDays: 0 });
  });
});
