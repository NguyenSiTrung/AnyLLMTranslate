/**
 * ShortcutsSection — Shortcut Studio smoke tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';
import type { ReactNode } from 'react';

const mockGetAll = vi.fn(async () => [
  { name: 'translate-page', shortcut: 'Alt+A', description: 'Translate the current page' },
  { name: 'translate-subtitles', shortcut: 'Alt+S', description: 'Translate video subtitles' },
  { name: 'toggle-display', shortcut: 'Alt+Z', description: 'Toggle translation display' },
  { name: 'restore-page', shortcut: 'Alt+X', description: 'Restore original page' },
  { name: 'translate-input-box', shortcut: '', description: 'Translate the focused input box' },
]);

const mockTabsCreate = vi.fn();

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  commands: {
    getAll: mockGetAll,
  },
  tabs: {
    create: mockTabsCreate,
  },
});

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@/ui/ToastProvider', () => ({
  useToast: () => ({
    success: toastSuccess,
    error: toastError,
    info: vi.fn(),
    warning: vi.fn(),
  }),
  ToastProvider: ({ children }: { children: ReactNode }) => children,
}));

import { useSettingsStore } from '@/stores/settingsStore';
import { ShortcutsSection } from '../ShortcutsSection';

describe('ShortcutsSection', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      inlineTranslate: {
        ...DEFAULT_SETTINGS.inlineTranslate,
        tapCount: 3,
        timeWindowMs: 800,
      },
    });
    mockGetAll.mockClear();
    mockTabsCreate.mockClear();
    toastSuccess.mockClear();
    toastError.mockClear();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async () => undefined),
      },
    });
  });

  it('renders studio, live shortcuts, Not set unbound, and search filter', async () => {
    render(<ShortcutsSection />);
    expect(screen.getByText('Shortcut Studio')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Translate page')).toBeInTheDocument();
    });
    expect(screen.getByText('Toggle hover translate')).toBeInTheDocument();
    expect(screen.getByText('On web pages')).toBeInTheDocument();
    expect(screen.getByText(/not inside this Settings page/i)).toBeInTheDocument();
    expect(screen.getByText('Space × 3')).toBeInTheDocument();
    expect(screen.queryByText('Alt+T')).not.toBeInTheDocument();
    expect(screen.queryByText('Alt+O')).not.toBeInTheDocument();

    expect(screen.getByText('Inline translate')).toBeInTheDocument();
    expect(screen.getAllByText('Not set').length).toBeGreaterThanOrEqual(1);

    fireEvent.change(screen.getByLabelText(/search shortcuts/i), {
      target: { value: 'hover' },
    });
    expect(screen.getByText('Toggle hover translate')).toBeInTheDocument();
    expect(screen.queryByText('Translate page')).not.toBeInTheDocument();
  });

  it('copies cheatsheet, opens manage URL, navigates to Inline', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onNav = vi.fn();

    render(<ShortcutsSection onNavigateToInline={onNav} />);
    await waitFor(() => expect(screen.getByText('Translate page')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /copy all/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = writeText.mock.calls.at(0)?.at(0);
    expect(String(copied ?? '')).toContain('AnyLLMTranslate shortcuts');
    expect(toastSuccess).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^manage$/i }));
    expect(mockTabsCreate).toHaveBeenCalledWith({
      url: 'chrome://extensions/shortcuts',
    });

    fireEvent.click(screen.getByRole('button', { name: /configure on inline/i }));
    expect(onNav).toHaveBeenCalled();
  });
});
