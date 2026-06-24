import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdvancedSection } from '../sections/AdvancedSection';
import { useSettingsStore } from '@/stores/settingsStore';

// Mock the settings store with selector support
vi.mock('@/stores/settingsStore');

// Mock ToastProvider
vi.mock('@/ui/ToastProvider', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
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

  it('renders Cache Configuration card with three input fields', () => {
    render(<AdvancedSection />);

    expect(screen.getByText('Performance & Caching')).toBeInTheDocument();
    expect(screen.getByLabelText('Cache TTL (days)')).toBeInTheDocument();
    expect(screen.getByLabelText('Max Cache Size (MB)')).toBeInTheDocument();
    expect(screen.getByLabelText('Max Batch Characters')).toBeInTheDocument();
  });

  it('renders inputs with correct initial values from settings', () => {
    render(<AdvancedSection />);

    const cacheTTLInput = screen.getByLabelText('Cache TTL (days)') as HTMLInputElement;
    const maxCacheSizeInput = screen.getByLabelText('Max Cache Size (MB)') as HTMLInputElement;
    const maxBatchCharsInput = screen.getByLabelText('Max Batch Characters') as HTMLInputElement;

    expect(cacheTTLInput.value).toBe('30');
    expect(maxCacheSizeInput.value).toBe('100');
    expect(maxBatchCharsInput.value).toBe('2000');
  });

  it('shows validation error for cacheTTL below minimum (1)', () => {
    render(<AdvancedSection />);

    const cacheTTLInput = screen.getByLabelText('Cache TTL (days)');
    fireEvent.change(cacheTTLInput, { target: { value: '0' } });
    fireEvent.blur(cacheTTLInput);

    expect(screen.getByText('Must be between 1 and 365 days')).toBeInTheDocument();
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('shows validation error for cacheTTL above maximum (365)', () => {
    render(<AdvancedSection />);

    const cacheTTLInput = screen.getByLabelText('Cache TTL (days)');
    fireEvent.change(cacheTTLInput, { target: { value: '400' } });
    fireEvent.blur(cacheTTLInput);

    expect(screen.getByText('Must be between 1 and 365 days')).toBeInTheDocument();
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('shows validation error for maxCacheSize below minimum (10)', () => {
    render(<AdvancedSection />);

    const maxCacheSizeInput = screen.getByLabelText('Max Cache Size (MB)');
    fireEvent.change(maxCacheSizeInput, { target: { value: '5' } });
    fireEvent.blur(maxCacheSizeInput);

    expect(screen.getByText('Must be between 10 and 1000 MB')).toBeInTheDocument();
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('shows validation error for maxCacheSize above maximum (1000)', () => {
    render(<AdvancedSection />);

    const maxCacheSizeInput = screen.getByLabelText('Max Cache Size (MB)');
    fireEvent.change(maxCacheSizeInput, { target: { value: '1500' } });
    fireEvent.blur(maxCacheSizeInput);

    expect(screen.getByText('Must be between 10 and 1000 MB')).toBeInTheDocument();
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('shows validation error for maxBatchChars below minimum (500)', () => {
    render(<AdvancedSection />);

    const maxBatchCharsInput = screen.getByLabelText('Max Batch Characters');
    fireEvent.change(maxBatchCharsInput, { target: { value: '100' } });
    fireEvent.blur(maxBatchCharsInput);

    expect(screen.getByText('Must be between 500 and 10000 characters')).toBeInTheDocument();
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('shows validation error for maxBatchChars above maximum (10000)', () => {
    render(<AdvancedSection />);

    const maxBatchCharsInput = screen.getByLabelText('Max Batch Characters');
    fireEvent.change(maxBatchCharsInput, { target: { value: '15000' } });
    fireEvent.blur(maxBatchCharsInput);

    expect(screen.getByText('Must be between 500 and 10000 characters')).toBeInTheDocument();
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('calls updateSettings with valid cacheTTL value on blur', () => {
    render(<AdvancedSection />);

    const cacheTTLInput = screen.getByLabelText('Cache TTL (days)');
    fireEvent.change(cacheTTLInput, { target: { value: '60' } });
    fireEvent.blur(cacheTTLInput);

    expect(mockUpdateSettings).toHaveBeenCalledWith({ cacheTTLDays: 60 });
    expect(screen.queryByText('Must be between 1 and 365 days')).not.toBeInTheDocument();
  });

  it('calls updateSettings with valid maxCacheSize value on blur', () => {
    render(<AdvancedSection />);

    const maxCacheSizeInput = screen.getByLabelText('Max Cache Size (MB)');
    fireEvent.change(maxCacheSizeInput, { target: { value: '250' } });
    fireEvent.blur(maxCacheSizeInput);

    expect(mockUpdateSettings).toHaveBeenCalledWith({ maxCacheSizeMB: 250 });
    expect(screen.queryByText('Must be between 10 and 1000 MB')).not.toBeInTheDocument();
  });

  it('calls updateSettings with valid maxBatchChars value on blur', () => {
    render(<AdvancedSection />);

    const maxBatchCharsInput = screen.getByLabelText('Max Batch Characters');
    fireEvent.change(maxBatchCharsInput, { target: { value: '3000' } });
    fireEvent.blur(maxBatchCharsInput);

    expect(mockUpdateSettings).toHaveBeenCalledWith({ maxBatchChars: 3000 });
    expect(screen.queryByText('Must be between 500 and 10000 characters')).not.toBeInTheDocument();
  });

  it('clears error message when user corrects invalid input', () => {
    render(<AdvancedSection />);

    const cacheTTLInput = screen.getByLabelText('Cache TTL (days)');
    
    // Enter invalid value
    fireEvent.change(cacheTTLInput, { target: { value: '400' } });
    fireEvent.blur(cacheTTLInput);
    expect(screen.getByText('Must be between 1 and 365 days')).toBeInTheDocument();

    // Correct to valid value
    fireEvent.change(cacheTTLInput, { target: { value: '50' } });
    fireEvent.blur(cacheTTLInput);
    expect(screen.queryByText('Must be between 1 and 365 days')).not.toBeInTheDocument();
    expect(mockUpdateSettings).toHaveBeenCalledWith({ cacheTTLDays: 50 });
  });

  it('displays helper text for each input field', () => {
    render(<AdvancedSection />);

    expect(screen.getByText('How long translations are cached before expiration.')).toBeInTheDocument();
    expect(screen.getByText('Maximum storage limit for the translation cache.')).toBeInTheDocument();
    expect(screen.getByText('Maximum characters sent per translation batch.')).toBeInTheDocument();
  });

  it('renders LLM Page Category Detection toggle', () => {
    render(<AdvancedSection />);
    expect(screen.getByText('LLM-based Page Category Detection')).toBeInTheDocument();
    expect(screen.getByText('Auto-detect page topic using LLM for better terminology. Requires background API call.')).toBeInTheDocument();
  });

  it('toggles LLM Page Category Detection on click', () => {
    render(<AdvancedSection />);
    const toggle = screen.getByRole('switch', { name: /LLM-based Page Category Detection/i });
    fireEvent.click(toggle);
    expect(mockUpdateSettings).toHaveBeenCalledWith({ enableLLMPageCategoryDetection: true });
  });

  it('renders Context-Aware Translation toggle', () => {
    render(<AdvancedSection />);
    expect(screen.getByText('Context-Aware Translation')).toBeInTheDocument();
    expect(screen.getByText('Inject page title, description, and domain into translation prompts for more consistent terminology.')).toBeInTheDocument();
  });

  it('calls updateSettings when Context-Aware Translation toggle is clicked', () => {
    render(<AdvancedSection />);
    const toggle = screen.getByRole('switch', { name: /context-aware translation/i });
    fireEvent.click(toggle);
    expect(mockUpdateSettings).toHaveBeenCalledWith({ enableContextAwareTranslation: false });
  });
});

describe('AdvancedSection - PDF Translator', () => {
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

  it('renders the PDF Translator card with auto-open mode defaulting to off', () => {
    render(<AdvancedSection />);
    expect(screen.getByText('PDF Translator')).toBeInTheDocument();
    const autoOpenSelect = screen.getByLabelText('Auto-open mode') as HTMLSelectElement;
    expect(autoOpenSelect.value).toBe('off');
  });

  it('renders the open-mode select defaulting to new-tab', () => {
    render(<AdvancedSection />);
    const openModeSelect = screen.getByLabelText('Open mode') as HTMLSelectElement;
    expect(openModeSelect.value).toBe('new-tab');
  });

  it('does NOT show never-open list when autoOpen is off', () => {
    render(<AdvancedSection />);
    expect(screen.queryByLabelText('Never auto-open these sites')).not.toBeInTheDocument();
  });

  it('shows never-open list after choosing auto', () => {
    render(<AdvancedSection />);
    fireEvent.change(screen.getByLabelText('Auto-open mode'), { target: { value: 'auto' } });
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      pdfSettings: { autoOpen: 'auto', openMode: 'new-tab', neverAutoOpenSites: [] },
    });
  });

  it('updates autoOpen mode via the select', () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const s = { ...baseSettings, pdfSettings: { ...baseSettings.pdfSettings, autoOpen: 'auto' as const } };
      if (typeof selector === 'function') return selector({ ...s, updateSettings: mockUpdateSettings, resetToDefaults: mockResetToDefaults });
      return { ...s, updateSettings: mockUpdateSettings, resetToDefaults: mockResetToDefaults };
    });
    render(<AdvancedSection />);
    fireEvent.change(screen.getByLabelText('Auto-open mode'), { target: { value: 'off' } });
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      pdfSettings: { autoOpen: 'off', openMode: 'new-tab', neverAutoOpenSites: [] },
    });
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

  it('renders the Rate Limiting card with maxRpm input', () => {
    render(<AdvancedSection />);
    expect(screen.getByText('Rate Limiting')).toBeInTheDocument();
    expect(screen.getByLabelText('Max requests per minute')).toBeInTheDocument();
  });

  it('renders input with default value 0', () => {
    render(<AdvancedSection />);
    const input = screen.getByLabelText('Max requests per minute') as HTMLInputElement;
    expect(input.value).toBe('0');
  });

  it('shows (unlimited) hint when value is 0', () => {
    render(<AdvancedSection />);
    expect(screen.getByText('(unlimited)')).toBeInTheDocument();
  });

  it('writes valid value on blur', () => {
    render(<AdvancedSection />);
    const input = screen.getByLabelText('Max requests per minute');
    fireEvent.change(input, { target: { value: '30' } });
    fireEvent.blur(input);
    expect(mockUpdateSettings).toHaveBeenCalledWith({ maxRpm: 30 });
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

  it('shows error for negative value', () => {
    render(<AdvancedSection />);
    const input = screen.getByLabelText('Max requests per minute');
    fireEvent.change(input, { target: { value: '-1' } });
    fireEvent.blur(input);
    expect(screen.getByText('Must be an integer between 0 and 600 (0 = unlimited)')).toBeInTheDocument();
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('shows error for value above 600', () => {
    render(<AdvancedSection />);
    const input = screen.getByLabelText('Max requests per minute');
    fireEvent.change(input, { target: { value: '601' } });
    fireEvent.blur(input);
    expect(screen.getByText('Must be an integer between 0 and 600 (0 = unlimited)')).toBeInTheDocument();
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('shows error for non-integer value', () => {
    render(<AdvancedSection />);
    const input = screen.getByLabelText('Max requests per minute');
    fireEvent.change(input, { target: { value: '3.5' } });
    fireEvent.blur(input);
    expect(screen.getByText('Must be an integer between 0 and 600 (0 = unlimited)')).toBeInTheDocument();
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('clears error when user corrects invalid input', () => {
    render(<AdvancedSection />);
    const input = screen.getByLabelText('Max requests per minute');
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.blur(input);
    expect(screen.getByText('Must be an integer between 0 and 600 (0 = unlimited)')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '20' } });
    fireEvent.blur(input);
    expect(screen.queryByText('Must be an integer between 0 and 600 (0 = unlimited)')).not.toBeInTheDocument();
    expect(mockUpdateSettings).toHaveBeenCalledWith({ maxRpm: 20 });
  });

  it('does not write when value is unchanged', () => {
    render(<AdvancedSection />);
    const input = screen.getByLabelText('Max requests per minute');
    // Value is already 0 in settings, blur without change
    fireEvent.blur(input);
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });
});
