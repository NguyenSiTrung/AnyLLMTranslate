import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { ToastProvider } from '@/ui/ToastProvider';
import { ADVANCED_SECTION_IDS } from '@/entrypoints/options/lib/scrollToAdvancedSection';
import { AdvancedSection } from '../AdvancedSection';

const scrollToAdvancedSection = vi.hoisted(() => vi.fn(() => true));

vi.mock('@/entrypoints/options/lib/scrollToAdvancedSection', async () => {
  const actual = await vi.importActual<
    typeof import('@/entrypoints/options/lib/scrollToAdvancedSection')
  >('@/entrypoints/options/lib/scrollToAdvancedSection');
  return {
    ...actual,
    scrollToAdvancedSection,
  };
});

vi.mock('@/entrypoints/options/hooks/useCacheStats', () => ({
  useCacheStats: () => ({
    entryCount: 0,
    totalSizeBytes: 0,
    sizeMb: 0,
    sizeLabel: '0 B',
    loading: false,
    refresh: vi.fn(),
  }),
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
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      updateSettings: vi.fn(),
    });
  });

  it('renders stable section anchors for every jump target', () => {
    renderAdvanced();
    for (const id of Object.values(ADVANCED_SECTION_IDS)) {
      const el = document.getElementById(id);
      expect(el).toBeTruthy();
      expect(el).toHaveAttribute('tabindex', '-1');
    }
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
    ];

    for (const { name, sectionId } of cases) {
      scrollToAdvancedSection.mockClear();
      fireEvent.click(screen.getByRole('button', { name }));
      expect(scrollToAdvancedSection).toHaveBeenCalledWith(sectionId);
    }

    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('keeps Active features region labeled for discovery', () => {
    renderAdvanced();
    expect(screen.getByText(/active features/i)).toBeInTheDocument();
  });
});
