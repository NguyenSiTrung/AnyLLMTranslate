/**
 * Tests for CustomThemeEditor component.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomThemeEditor } from '../CustomThemeEditor';
import { useSettingsStore } from '@/stores/settingsStore';
import { DEFAULT_CUSTOM_THEME } from '@/types/config';

vi.mock('@/stores/settingsStore');

describe('CustomThemeEditor', () => {
  const mockUpdateSettings = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        customTheme: { ...DEFAULT_CUSTOM_THEME },
        updateSettings: mockUpdateSettings,
      };
      return selector ? selector(state) : state;
    });
  });

  it('renders all 6 controls', () => {
    render(<CustomThemeEditor />);

    expect(screen.getByLabelText('Translation Text Color')).toBeInTheDocument();
    expect(screen.getByLabelText('Translation Background Color')).toBeInTheDocument();
    expect(screen.getByLabelText('Border Style')).toBeInTheDocument();
    expect(screen.getByLabelText('Border Color')).toBeInTheDocument();
    expect(screen.getByLabelText('Font Style')).toBeInTheDocument();
    expect(screen.getByLabelText('Font Size')).toBeInTheDocument();
  });

  it('renders the card title', () => {
    render(<CustomThemeEditor />);
    expect(screen.getByText('Custom Theme Editor')).toBeInTheDocument();
  });

  it('renders reset button', () => {
    render(<CustomThemeEditor />);
    expect(screen.getByRole('button', { name: /reset to defaults/i })).toBeInTheDocument();
  });

  it('updates text color when color picker changes', () => {
    render(<CustomThemeEditor />);

    const textColorInput = screen.getByLabelText('Translation Text Color') as HTMLInputElement;
    fireEvent.change(textColorInput, { target: { value: '#ff0000' } });

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      customTheme: expect.objectContaining({ textColor: '#ff0000' }),
    });
  });

  it('updates background color when color picker changes', () => {
    render(<CustomThemeEditor />);

    const bgColorInput = screen.getByLabelText('Translation Background Color') as HTMLInputElement;
    fireEvent.change(bgColorInput, { target: { value: '#00ff00' } });

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      customTheme: expect.objectContaining({ backgroundColor: '#00ff00' }),
    });
  });

  it('updates border style when select changes', () => {
    render(<CustomThemeEditor />);

    const borderStyleSelect = screen.getByLabelText('Border Style') as HTMLSelectElement;
    fireEvent.change(borderStyleSelect, { target: { value: 'dashed' } });

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      customTheme: expect.objectContaining({ borderStyle: 'dashed' }),
    });
  });

  it('updates border color when color picker changes', () => {
    render(<CustomThemeEditor />);

    const borderColorInput = screen.getByLabelText('Border Color') as HTMLInputElement;
    fireEvent.change(borderColorInput, { target: { value: '#0000ff' } });

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      customTheme: expect.objectContaining({ borderColor: '#0000ff' }),
    });
  });

  it('updates font style when select changes', () => {
    render(<CustomThemeEditor />);

    const fontStyleSelect = screen.getByLabelText('Font Style') as HTMLSelectElement;
    fireEvent.change(fontStyleSelect, { target: { value: 'italic' } });

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      customTheme: expect.objectContaining({ fontStyle: 'italic' }),
    });
  });

  it('updates font size when select changes', () => {
    render(<CustomThemeEditor />);

    const fontSizeSelect = screen.getByLabelText('Font Size') as HTMLSelectElement;
    fireEvent.change(fontSizeSelect, { target: { value: 'larger' } });

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      customTheme: expect.objectContaining({ fontSize: 'larger' }),
    });
  });

  it('resets to defaults when reset button is clicked', () => {
    render(<CustomThemeEditor />);

    const resetButton = screen.getByRole('button', { name: /reset to defaults/i });
    fireEvent.click(resetButton);

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      customTheme: { ...DEFAULT_CUSTOM_THEME },
    });
  });

  it('preserves existing customTheme values when updating a single field', () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        customTheme: {
          textColor: '#ff0000',
          backgroundColor: '#00ff00',
          borderStyle: 'dashed' as const,
          borderColor: '#0000ff',
          fontStyle: 'italic' as const,
          fontSize: 'larger' as const,
        },
        updateSettings: mockUpdateSettings,
      };
      return selector ? selector(state) : state;
    });

    render(<CustomThemeEditor />);

    const textColorInput = screen.getByLabelText('Translation Text Color') as HTMLInputElement;
    fireEvent.change(textColorInput, { target: { value: '#111111' } });

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      customTheme: expect.objectContaining({
        textColor: '#111111',
        backgroundColor: '#00ff00',
        borderStyle: 'dashed',
        borderColor: '#0000ff',
        fontStyle: 'italic',
        fontSize: 'larger',
      }),
    });
  });
});
