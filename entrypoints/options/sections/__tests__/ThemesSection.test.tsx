/**
 * ThemesSection — Theme Studio smoke tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';

const mockStorageData: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorageData[key] })),
      set: vi.fn(async (data: Record<string, unknown>) => {
        Object.assign(mockStorageData, data);
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
});

import { useSettingsStore } from '@/stores/settingsStore';
import { ThemesSection } from '../ThemesSection';

describe('ThemesSection', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      theme: 'blockquote',
      displayMode: 'bilingual-below',
      translationPosition: 'below',
      darkMode: 'auto',
    });
    for (const k of Object.keys(mockStorageData)) {
      Reflect.deleteProperty(mockStorageData, k);
    }
    vi.clearAllMocks();
  });

  it('header, commit on click, soft-preview hover, category filter', async () => {
    render(<ThemesSection />);
    expect(screen.getByRole('heading', { name: /Theme Studio/i })).toBeInTheDocument();

    const card = screen.getByRole('radio', { name: /Speech Bubble/i });
    fireEvent.mouseEnter(card);
    expect(useSettingsStore.getState().theme).toBe('blockquote');
    expect(screen.getByText(/Previewing/i)).toBeInTheDocument();

    fireEvent.click(card);
    await waitFor(() => {
      expect(useSettingsStore.getState().theme).toBe('bubble');
    });

    fireEvent.click(screen.getByRole('tab', { name: /^Classic$/i }));
    expect(screen.getByRole('radio', { name: /Blockquote/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Speech Bubble/i })).not.toBeInTheDocument();
  });

  it('custom editor, sample states, and navigate to General', () => {
    useSettingsStore.setState({ theme: 'custom' });
    const nav = vi.fn();
    render(<ThemesSection onNavigateToGeneral={nav} />);
    expect(screen.getByText(/Start from preset/i)).toBeInTheDocument();
    expect(screen.getByText(/Translation Text Color/i)).toBeInTheDocument();

    expect(screen.queryByText(/Translation failed/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show sample states/i }));
    expect(screen.getByText(/Translation failed/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Open General/i }));
    expect(nav).toHaveBeenCalled();
  });

  it('keeps custom color text edits local until blur', () => {
    const updateSettings = vi.fn();
    useSettingsStore.setState({ theme: 'custom', updateSettings });
    render(<ThemesSection />);
    const input = screen.getAllByRole('textbox')[0] as HTMLInputElement;

    input.focus();
    fireEvent.change(input, { target: { value: '#123456' } });

    expect(input).toHaveFocus();
    expect(input.value).toBe('#123456');
    expect(updateSettings).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(updateSettings).toHaveBeenCalledWith({
      customTheme: expect.objectContaining({ textColor: '#123456' }),
    });
  });
});
