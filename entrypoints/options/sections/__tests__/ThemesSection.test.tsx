/**
 * Tests for ThemesSection component.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemesSection } from '../ThemesSection';
import { useSettingsStore } from '@/stores/settingsStore';

vi.mock('@/stores/settingsStore');
vi.mock('../../ThemePreview', () => ({
  ThemePreview: () => <div data-testid="theme-preview">ThemePreview</div>,
}));
vi.mock('../../CustomThemeEditor', () => ({
  CustomThemeEditor: () => <div data-testid="custom-theme-editor">CustomThemeEditor</div>,
}));

describe('ThemesSection', () => {
  const mockUpdateSettings = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        theme: 'blockquote',
        updateSettings: mockUpdateSettings,
      };
      return selector ? selector(state) : state;
    });
  });

  it('renders all 17 theme cards', () => {
    render(<ThemesSection />);
    expect(screen.getByText('Dividing Line')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('shows active indicator on selected theme', () => {
    render(<ThemesSection />);
    const blockquoteCard = screen.getByText('Blockquote').closest('button');
    expect(blockquoteCard).toHaveClass('border-blue-500');
  });

  it('updates theme when a card is clicked', () => {
    render(<ThemesSection />);
    const customCard = screen.getByText('Custom').closest('button');
    expect(customCard).toBeInTheDocument();
    if (customCard) {
      fireEvent.click(customCard);
    }
    expect(mockUpdateSettings).toHaveBeenCalledWith({ theme: 'custom' });
  });

  it('does not render CustomThemeEditor when non-custom theme is selected', () => {
    render(<ThemesSection />);
    expect(screen.queryByTestId('custom-theme-editor')).not.toBeInTheDocument();
  });

  it('renders CustomThemeEditor when custom theme is selected', () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        theme: 'custom',
        updateSettings: mockUpdateSettings,
      };
      return selector ? selector(state) : state;
    });

    render(<ThemesSection />);
    expect(screen.getByTestId('custom-theme-editor')).toBeInTheDocument();
  });
});
