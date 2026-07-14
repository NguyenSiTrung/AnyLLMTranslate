/**
 * GeneralSection — four-card IA, swap, disabled position, browse themes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
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

// Import after chrome stub
import { useSettingsStore } from '@/stores/settingsStore';
import { GeneralSection } from '../GeneralSection';

describe('GeneralSection', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      displayMode: 'bilingual-below',
      translationPosition: 'below',
      theme: 'blockquote',
      darkMode: 'auto',
      enableCompactInlineForShortText: false,
    });
    for (const k of Object.keys(mockStorageData)) {
      Reflect.deleteProperty(mockStorageData, k);
    }
    vi.clearAllMocks();
  });

  it('renders four-card IA with updated labels (no legacy Display & Appearance)', () => {
    render(<GeneralSection />);
    expect(screen.getByRole('heading', { name: 'Language', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Layout', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Style', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Advanced display', level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Display & Appearance' })).not.toBeInTheDocument();
    expect(screen.getByText('Page contrast')).toBeInTheDocument();
    expect(screen.queryByText('Host Page Mode')).not.toBeInTheDocument();
  });

  it('swaps languages when not auto and disables swap / position when locked', async () => {
    const { unmount } = render(<GeneralSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Swap languages' }));
    await waitFor(() => {
      const state = useSettingsStore.getState();
      expect(state.sourceLanguage).toBe('vi');
      expect(state.targetLanguage).toBe('en');
    });
    unmount();

    useSettingsStore.setState({ sourceLanguage: 'auto', targetLanguage: 'vi' });
    const { unmount: unmount2 } = render(<GeneralSection />);
    expect(screen.getByRole('button', { name: 'Swap languages' })).toBeDisabled();
    unmount2();

    useSettingsStore.setState({ sourceLanguage: 'en', displayMode: 'translation-only' });
    render(<GeneralSection />);
    const positionGroup = document.getElementById('general-translation-position');
    expect(positionGroup).toHaveAttribute('aria-disabled', 'true');
    for (const radio of within(positionGroup as HTMLElement).getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
  });

  it('navigates to themes only when callback provided', () => {
    const onNavigate = vi.fn();
    const { unmount } = render(<GeneralSection onNavigateToThemes={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /Browse themes/i }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    unmount();

    render(<GeneralSection />);
    expect(screen.queryByRole('button', { name: /Browse themes/i })).not.toBeInTheDocument();
  });

  it('updates theme, page contrast, and compact-inline settings', async () => {
    render(<GeneralSection />);

    const select = document.getElementById('general-theme') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'bubble' } });
    await waitFor(() => {
      expect(useSettingsStore.getState().theme).toBe('bubble');
    });

    const group = document.getElementById('general-host-page-mode') as HTMLElement;
    fireEvent.click(within(group).getByRole('radio', { name: /Dark/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().darkMode).toBe('dark');
    });

    fireEvent.click(screen.getByRole('switch', { name: /Compact inline for short text/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().enableCompactInlineForShortText).toBe(true);
    });
  });
});
