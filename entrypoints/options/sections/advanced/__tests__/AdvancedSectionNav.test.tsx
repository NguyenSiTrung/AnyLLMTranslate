/**
 * Tests: explicit Advanced section navigation — neutral labeled buttons for
 * every destination, wired to scrollToAdvancedSection.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type * as ScrollNavModule from '@/entrypoints/options/lib/scrollToAdvancedSection';
import { ADVANCED_SECTION_IDS } from '@/entrypoints/options/lib/scrollToAdvancedSection';
import { AdvancedSectionNav } from '../AdvancedSectionNav';

const scrollToAdvancedSection = vi.hoisted(() => vi.fn(() => true));

vi.mock('@/entrypoints/options/lib/scrollToAdvancedSection', async () => {
  const actual = await vi.importActual<typeof ScrollNavModule>(
    '@/entrypoints/options/lib/scrollToAdvancedSection',
  );
  return { ...actual, scrollToAdvancedSection };
});

describe('AdvancedSectionNav', () => {
  beforeEach(() => {
    scrollToAdvancedSection.mockClear();
  });

  it('renders a labeled button for every Advanced destination', () => {
    render(<AdvancedSectionNav />);
    const nav = screen.getByRole('navigation', { name: /advanced sections/i });
    for (const label of [
      'Translation engine',
      'Performance',
      'Website compatibility',
      'Data and recovery',
      'Diagnostics',
    ]) {
      expect(within(nav).getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('jumps to each section id on click', () => {
    render(<AdvancedSectionNav />);
    const pairs: Array<[string, string]> = [
      ['Translation engine', ADVANCED_SECTION_IDS.translation],
      ['Performance', ADVANCED_SECTION_IDS.performance],
      ['Website compatibility', ADVANCED_SECTION_IDS.compatibility],
      ['Data and recovery', ADVANCED_SECTION_IDS.data],
      ['Diagnostics', ADVANCED_SECTION_IDS.diagnostics],
    ];
    for (const [label, id] of pairs) {
      scrollToAdvancedSection.mockClear();
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(scrollToAdvancedSection).toHaveBeenCalledWith(id);
    }
  });
});
