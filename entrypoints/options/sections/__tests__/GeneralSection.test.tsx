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

  it('renders four card titles', () => {
    render(<GeneralSection />);
    expect(screen.getByRole('heading', { name: 'Language', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Layout', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Style', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Advanced display', level: 3 })).toBeInTheDocument();
  });

  it('does not render the old merged Display & Appearance card title', () => {
    render(<GeneralSection />);
    expect(screen.queryByRole('heading', { name: 'Display & Appearance' })).not.toBeInTheDocument();
  });

  it('swaps source and target languages when source is not auto', async () => {
    render(<GeneralSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Swap languages' }));
    await waitFor(() => {
      const state = useSettingsStore.getState();
      expect(state.sourceLanguage).toBe('vi');
      expect(state.targetLanguage).toBe('en');
    });
  });

  it('disables swap when source is auto', () => {
    useSettingsStore.setState({ sourceLanguage: 'auto', targetLanguage: 'vi' });
    render(<GeneralSection />);
    expect(screen.getByRole('button', { name: 'Swap languages' })).toBeDisabled();
  });

  it('disables translation position control in translation-only mode', () => {
    useSettingsStore.setState({ displayMode: 'translation-only' });
    render(<GeneralSection />);
    const positionGroup = document.getElementById('general-translation-position');
    expect(positionGroup).not.toBeNull();
    expect(positionGroup).toHaveAttribute('aria-disabled', 'true');
    const radios = within(positionGroup as HTMLElement).getAllByRole('radio');
    for (const radio of radios) {
      expect(radio).toBeDisabled();
    }
  });

  it('calls onNavigateToThemes when Browse themes is clicked', () => {
    const onNavigate = vi.fn();
    render(<GeneralSection onNavigateToThemes={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /Browse themes/i }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('hides Browse themes when callback is omitted', () => {
    render(<GeneralSection />);
    expect(screen.queryByRole('button', { name: /Browse themes/i })).not.toBeInTheDocument();
  });

  it('shows Page contrast label (not Host Page Mode)', () => {
    render(<GeneralSection />);
    expect(screen.getByText('Page contrast')).toBeInTheDocument();
    expect(screen.queryByText('Host Page Mode')).not.toBeInTheDocument();
  });

  it('updates theme via quick select', async () => {
    render(<GeneralSection />);
    const select = document.getElementById('general-theme') as HTMLSelectElement;
    expect(select).toBeTruthy();
    fireEvent.change(select, { target: { value: 'bubble' } });
    await waitFor(() => {
      expect(useSettingsStore.getState().theme).toBe('bubble');
    });
  });

  it('updates darkMode (page contrast) via segmented control', async () => {
    render(<GeneralSection />);
    const group = document.getElementById('general-host-page-mode') as HTMLElement;
    const darkBtn = within(group).getByRole('radio', { name: /Dark/i });
    fireEvent.click(darkBtn);
    await waitFor(() => {
      expect(useSettingsStore.getState().darkMode).toBe('dark');
    });
  });

  it('toggles compact inline setting', async () => {
    render(<GeneralSection />);
    fireEvent.click(screen.getByRole('switch', { name: /Compact inline for short text/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().enableCompactInlineForShortText).toBe(true);
    });
  });
});
