import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

function renderAdvanced() {
  return render(
    <ToastProvider>
      <AdvancedSection />
    </ToastProvider>,
  );
}

describe('AdvancedSection Active features jump nav', () => {
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

  it('renders stable section anchors and a labeled Active features region', () => {
    renderAdvanced();
    for (const id of Object.values(ADVANCED_SECTION_IDS)) {
      const el = document.getElementById(id);
      expect(el).toBeTruthy();
      expect(el).toHaveAttribute('tabindex', '-1');
    }
    expect(screen.getByText(/active features/i)).toBeInTheDocument();
  });

  it('jumps from each Active features chip without mutating settings', () => {
    const updateSettings = vi.fn();
    useSettingsStore.setState({ updateSettings });
    renderAdvanced();

    const cases: Array<{ name: RegExp; sectionId: string }> = [
      { name: /jump to translation system prompt/i, sectionId: ADVANCED_SECTION_IDS.prompt },
      { name: /jump to context & intelligence/i, sectionId: ADVANCED_SECTION_IDS.context },
      { name: /jump to translation quality/i, sectionId: ADVANCED_SECTION_IDS.quality },
      { name: /jump to developer/i, sectionId: ADVANCED_SECTION_IDS.developer },
      { name: /jump to performance & throughput/i, sectionId: ADVANCED_SECTION_IDS.performance },
      { name: /jump to pdf translator/i, sectionId: ADVANCED_SECTION_IDS.pdf },
      { name: /jump to clear translation cache/i, sectionId: ADVANCED_SECTION_IDS.cache },
    ];

    for (const { name, sectionId } of cases) {
      scrollToAdvancedSection.mockClear();
      fireEvent.click(screen.getByRole('button', { name }));
      expect(scrollToAdvancedSection).toHaveBeenCalledWith(sectionId);
    }

    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('opens the clear-cache modal from the overview panel without scrolling', () => {
    renderAdvanced();

    fireEvent.click(screen.getByRole('button', { name: 'Clear translation cache' }));

    expect(scrollToAdvancedSection).not.toHaveBeenCalled();
    expect(screen.getByText(/clear translation cache\?/i)).toBeInTheDocument();
  });

  it('disables the overview Clear button when the cache is empty', () => {
    cacheStatsState.entryCount = 0;
    renderAdvanced();

    expect(screen.getByRole('button', { name: 'Clear translation cache' })).toBeDisabled();
  });
});
