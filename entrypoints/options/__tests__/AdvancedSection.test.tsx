import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdvancedSection } from '../sections/AdvancedSection';
import { useSettingsStore } from '@/stores/settingsStore';
import { getCacheStats } from '@/services/cacheManager';

// Mock the settings store with selector support
vi.mock('@/stores/settingsStore');

// Mock ToastProvider with stable refs so tests can assert on toast messages.
const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));
vi.mock('@/ui/ToastProvider', () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

// Mock cacheManager so useCacheStats doesn't hit real IndexedDB in jsdom
vi.mock('@/services/cacheManager', () => ({
  getCacheStats: vi.fn(),
}));

describe('AdvancedSection - Cache Configuration', () => {
  const mockUpdateSettings = vi.fn().mockResolvedValue(undefined);
  const mockResetToDefaults = vi.fn().mockResolvedValue(undefined);

  const mockSettings = {
    cacheTTLDays: 30,
    maxCacheSizeMB: 100,
    maxBatchChars: 2000,
    provider: {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4',
    },
    sourceLanguage: 'en',
    targetLanguage: 'es',
    displayMode: 'bilingual-below',
    theme: 'blockquote',
    translationPosition: 'below',
    darkMode: false,
    siteRules: [],
    glossary: [],
    subtitleSettings: {
      enabled: false,
      position: 'bottom',
    },
    customSystemPrompt: '',
    debugMode: false,
    textSelectionEnabled: true,
    hoverTranslateEnabled: false,
    hoverDelay: 300,
    enableContextAwareTranslation: true,
    enableLLMPageCategoryDetection: false,
    maxRpm: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the store to handle both selector and direct calls
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return selector({
          ...mockSettings,
          updateSettings: mockUpdateSettings,
          resetToDefaults: mockResetToDefaults,
        });
      }
      return {
        ...mockSettings,
        updateSettings: mockUpdateSettings,
        resetToDefaults: mockResetToDefaults,
      };
    });
  });

  it('calls updateSettings with valid cacheTTL value on blur', () => {
    render(<AdvancedSection />);

    const cacheTTLInput = screen.getByLabelText('Cache TTL (days)');
    fireEvent.change(cacheTTLInput, { target: { value: '60' } });
    fireEvent.blur(cacheTTLInput);

    expect(mockUpdateSettings).toHaveBeenCalledWith({ cacheTTLDays: 60 });
    expect(screen.queryByText('Must be between 1 and 365 days')).not.toBeInTheDocument();
  });
});

describe('AdvancedSection - Rate Limiting', () => {
  const mockUpdateSettings = vi.fn().mockResolvedValue(undefined);
  const mockResetToDefaults = vi.fn().mockResolvedValue(undefined);

  const baseSettings = {
    cacheTTLDays: 30,
    maxCacheSizeMB: 100,
    maxBatchChars: 2000,
    provider: { baseUrl: 'https://api.openai.com/v1', apiKey: 'test-key', model: 'gpt-4' },
    sourceLanguage: 'en',
    targetLanguage: 'es',
    displayMode: 'bilingual-below',
    theme: 'blockquote',
    translationPosition: 'below',
    darkMode: false,
    siteRules: [],
    glossary: [],
    subtitleSettings: { enabled: false, position: 'bottom' },
    customSystemPrompt: '',
    debugMode: false,
    textSelectionEnabled: true,
    hoverTranslateEnabled: false,
    hoverDelay: 300,
    enableContextAwareTranslation: true,
    enableLLMPageCategoryDetection: false,
    pdfSettings: { autoOpen: 'off' as const, openMode: 'new-tab' as const, neverAutoOpenSites: [] },
    maxRpm: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return selector({ ...baseSettings, updateSettings: mockUpdateSettings, resetToDefaults: mockResetToDefaults });
      }
      return { ...baseSettings, updateSettings: mockUpdateSettings, resetToDefaults: mockResetToDefaults };
    });
  });

  it('writes 0 (unlimited) on blur', () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const s = { ...baseSettings, maxRpm: 60 };
      if (typeof selector === 'function') return selector({ ...s, updateSettings: mockUpdateSettings, resetToDefaults: mockResetToDefaults });
      return { ...s, updateSettings: mockUpdateSettings, resetToDefaults: mockResetToDefaults };
    });
    render(<AdvancedSection />);
    const input = screen.getByLabelText('Max requests per minute');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(mockUpdateSettings).toHaveBeenCalledWith({ maxRpm: 0 });
  });
});

describe('AdvancedSection - Translation System Prompt (FR-9)', () => {
  const mockUpdateSettings = vi.fn().mockResolvedValue(undefined);
  const mockResetToDefaults = vi.fn().mockResolvedValue(undefined);

  const baseSettings = {
    cacheTTLDays: 30,
    maxCacheSizeMB: 100,
    maxBatchChars: 2000,
    provider: { baseUrl: 'https://api.openai.com/v1', apiKey: 'test-key', model: 'gpt-4' },
    sourceLanguage: 'en',
    targetLanguage: 'es',
    displayMode: 'bilingual-below' as const,
    theme: 'blockquote',
    translationPosition: 'below',
    darkMode: false,
    siteRules: [],
    glossary: [],
    subtitleSettings: { enabled: false, position: 'bottom' },
    customSystemPrompt: null as string | null,
    debugMode: false,
    textSelectionEnabled: true,
    hoverTranslateEnabled: false,
    hoverDelay: 300,
    enableContextAwareTranslation: true,
    enableLLMPageCategoryDetection: false,
    pdfSettings: { autoOpen: 'off' as const, openMode: 'new-tab' as const, neverAutoOpenSites: [] },
    maxRpm: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return selector({ ...baseSettings, updateSettings: mockUpdateSettings, resetToDefaults: mockResetToDefaults });
      }
      return { ...baseSettings, updateSettings: mockUpdateSettings, resetToDefaults: mockResetToDefaults };
    });
  });

  it('resets the prompt to default when Reset button is clicked', () => {
    render(<AdvancedSection />);
    // Two cards now have a "Reset to Default"-style button (cache + prompt);
    // target the prompt's by scoping to the prompt card.
    const resetBtns = screen.getAllByRole('button', { name: /reset to default/i });
    // Click the LAST one — the prompt card is rendered after the cache card.
    fireEvent.click(resetBtns[resetBtns.length - 1]);
    expect(mockUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ customSystemPrompt: null }),
    );
  });
});

describe('AdvancedSection - Data Portability (FR-10, FR-11)', () => {
  const mockUpdateSettings = vi.fn().mockResolvedValue(undefined);
  const mockResetToDefaults = vi.fn().mockResolvedValue(undefined);

  const baseSettings = {
    provider: { baseUrl: 'https://api.openai.com/v1', apiKey: 'test-key', model: 'gpt-4' },
    sourceLanguage: 'en',
    targetLanguage: 'es',
    displayMode: 'bilingual-below',
    theme: 'blockquote',
    translationPosition: 'below',
    darkMode: false,
    siteRules: [],
    glossary: [],
    subtitleSettings: { enabled: false, position: 'bottom' },
    customSystemPrompt: null,
    maxBatchChars: 2000,
    cacheTTLDays: 30,
    maxCacheSizeMB: 100,
    debugMode: false,
    customTheme: null,
    enableContextAwareTranslation: true,
    enableLLMPageCategoryDetection: false,
    llmCategoryDetectionMode: 'off',
    textSelectionEnabled: true,
    hoverTranslateEnabled: false,
    hoverDelay: 300,
    inlineTranslate: false,
    enableSmartExcludes: true,
    maxRpm: 0,
    pdfSettings: { autoOpen: 'off', openMode: 'new-tab', neverAutoOpenSites: [] },
    updateSettings: mockUpdateSettings,
    resetToDefaults: mockResetToDefaults,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCacheStats).mockResolvedValue({ entryCount: 0, totalSizeBytes: 0 });
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      if (typeof selector === 'function') return selector(baseSettings);
      return baseSettings;
    });
  });

  it('derives the export payload from the PORTABLE_KEYS allowlist (FR-11)', async () => {
    let capturedBlob: Blob | undefined;
    // jsdom does not implement URL.createObjectURL/revokeObjectURL; install fakes.
    const createMock = vi.fn((obj: Blob | MediaSource) => {
      capturedBlob = obj as Blob;
      return 'blob:fake';
    });
    Object.defineProperty(URL, 'createObjectURL', { value: createMock, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true });
    const clickSpy = vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {});

    try {
      render(<AdvancedSection />);
      fireEvent.click(screen.getByRole('button', { name: 'Export Settings' }));

      expect(capturedBlob).toBeDefined();
      const text = await (capturedBlob as Blob).text();
      const json = JSON.parse(text);
      expect(Object.keys(json)).toEqual([
        'provider', 'sourceLanguage', 'targetLanguage', 'displayMode', 'theme',
        'translationPosition', 'darkMode', 'siteRules', 'glossary', 'subtitleSettings',
        'customSystemPrompt', 'maxBatchChars', 'cacheTTLDays', 'maxCacheSizeMB',
        'debugMode', 'customTheme', 'enableContextAwareTranslation',
        'enableLLMPageCategoryDetection', 'llmCategoryDetectionMode',
        'textSelectionEnabled', 'hoverTranslateEnabled', 'hoverDelay',
        'inlineTranslate', 'enableSmartExcludes', 'maxRpm',
      ]);
    } finally {
      clickSpy.mockRestore();
      delete (URL as Partial<typeof URL>).createObjectURL;
      delete (URL as Partial<typeof URL>).revokeObjectURL;
    }
  });

  it('reports ignored unknown keys after import (FR-11)', async () => {
    render(<AdvancedSection />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(
      [JSON.stringify({ targetLanguage: 'de', bogusKey1: 'x', bogusKey2: 'y' })],
      'settings.json',
      { type: 'application/json' },
    );
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalled());
    expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.stringContaining('ignored 2 unknown key(s)'),
    );
  });
});
