import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { ToastProvider } from '@/ui/ToastProvider';
import type * as ScrollNavModule from '@/entrypoints/options/lib/scrollToAdvancedSection';
import { ADVANCED_SECTION_IDS } from '@/entrypoints/options/lib/scrollToAdvancedSection';
import { AdvancedSection } from '../AdvancedSection';

const scrollToAdvancedSection = vi.hoisted(() => vi.fn(() => true));

vi.mock('@/entrypoints/options/lib/scrollToAdvancedSection', async () => {
  const actual = await vi.importActual<typeof ScrollNavModule>(
    '@/entrypoints/options/lib/scrollToAdvancedSection',
  );
  return {
    ...actual,
    scrollToAdvancedSection,
  };
});

const cacheStatsState = vi.hoisted(() => ({
  entryCount: 12,
  totalSizeBytes: 2048,
  sizeMb: 0.002,
  sizeLabel: '2 KB',
  loading: false,
  refresh: vi.fn(),
}));

vi.mock('@/entrypoints/options/hooks/useCacheStats', () => ({
  useCacheStats: () => cacheStatsState,
}));

vi.mock('@/lib/config', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    savePreImportSnapshot: vi.fn(async () => {}),
    loadPreImportSnapshot: vi.fn(async () => null),
    clearPreImportSnapshot: vi.fn(async () => {}),
  };
});

function renderAdvanced() {
  return render(
    <ToastProvider>
      <AdvancedSection />
    </ToastProvider>,
  );
}

const destinations = [
  ['Translation engine', ADVANCED_SECTION_IDS.translation],
  ['Performance', ADVANCED_SECTION_IDS.performance],
  ['Website compatibility', ADVANCED_SECTION_IDS.compatibility],
  ['Data and recovery', ADVANCED_SECTION_IDS.data],
  ['Diagnostics', ADVANCED_SECTION_IDS.diagnostics],
] as const;

describe('AdvancedSection explicit section navigation', () => {
  beforeEach(() => {
    scrollToAdvancedSection.mockClear();
    cacheStatsState.entryCount = 12;
    cacheStatsState.loading = false;
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      updateSettings: vi.fn(),
    });
  });

  it('renders explicit navigation for every Advanced destination', () => {
    renderAdvanced();
    const nav = screen.getByRole('navigation', { name: /advanced sections/i });
    for (const [label, id] of destinations) {
      expect(
        within(nav).getByRole('button', { name: label }),
      ).toBeInTheDocument();
      expect(document.getElementById(id)).toHaveAttribute('tabindex', '-1');
    }
  });

  it('jumps without changing settings', () => {
    const updateSettings = vi.fn();
    useSettingsStore.setState({ updateSettings });
    renderAdvanced();
    const nav = screen.getByRole('navigation', { name: /advanced sections/i });
    for (const [label, id] of destinations) {
      scrollToAdvancedSection.mockClear();
      fireEvent.click(within(nav).getByRole('button', { name: label }));
      expect(scrollToAdvancedSection).toHaveBeenCalledWith(id);
    }
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('keeps only Reset all settings in the Danger Zone', () => {
    renderAdvanced();
    const danger = screen.getByText('Danger Zone').closest('section');
    expect(danger).toBeTruthy();
    expect(
      within(danger as HTMLElement).queryByRole('button', {
        name: /clear cache/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(danger as HTMLElement).getByRole('button', {
        name: /reset everything/i,
      }),
    ).toBeInTheDocument();
  });

  it('the Export backup first action jumps to Data and recovery without exporting', () => {
    renderAdvanced();
    fireEvent.click(
      screen.getByRole('button', { name: /export backup first/i }),
    );
    expect(scrollToAdvancedSection).toHaveBeenCalledWith(
      ADVANCED_SECTION_IDS.data,
    );
    expect(
      screen.queryByRole('dialog', { name: /export settings/i }),
    ).not.toBeInTheDocument();
  });
});
