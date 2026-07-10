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

  it('renders Theme Studio header', () => {
    render(<ThemesSection />);
    expect(screen.getByRole('heading', { name: /Theme Studio/i })).toBeInTheDocument();
  });

  it('commits theme on card click', async () => {
    render(<ThemesSection />);
    fireEvent.click(screen.getByRole('radio', { name: /Speech Bubble/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().theme).toBe('bubble');
    });
  });

  it('soft-preview on hover does not commit', () => {
    render(<ThemesSection />);
    const card = screen.getByRole('radio', { name: /Speech Bubble/i });
    fireEvent.mouseEnter(card);
    expect(useSettingsStore.getState().theme).toBe('blockquote');
    expect(screen.getByText(/Previewing/i)).toBeInTheDocument();
  });

  it('filters by category Classic', () => {
    render(<ThemesSection />);
    fireEvent.click(screen.getByRole('tab', { name: /^Classic$/i }));
    expect(screen.getByRole('radio', { name: /Blockquote/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Speech Bubble/i })).not.toBeInTheDocument();
  });

  it('shows custom editor when custom selected', () => {
    useSettingsStore.setState({ theme: 'custom' });
    render(<ThemesSection />);
    expect(screen.getByText(/Start from preset/i)).toBeInTheDocument();
    expect(screen.getByText(/Translation Text Color/i)).toBeInTheDocument();
  });

  it('sample states hidden by default', () => {
    render(<ThemesSection />);
    expect(screen.queryByText(/Translation failed/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show sample states/i }));
    expect(screen.getByText(/Translation failed/i)).toBeInTheDocument();
  });

  it('calls onNavigateToGeneral from footer', () => {
    const nav = vi.fn();
    render(<ThemesSection onNavigateToGeneral={nav} />);
    fireEvent.click(screen.getByRole('button', { name: /Open General/i }));
    expect(nav).toHaveBeenCalled();
  });
});
