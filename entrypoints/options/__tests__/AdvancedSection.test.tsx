import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdvancedSection } from '../sections/AdvancedSection';
import { useSettingsStore } from '@/stores/settingsStore';
import { getCacheStats } from '@/services/cacheManager';

// Mock the settings store with selector support
vi.mock('@/stores/settingsStore');

// Mock ToastProvider
vi.mock('@/ui/ToastProvider', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
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

  it('renders Cache Configuration card with fields, initial values, and helper text', () => {
    render(<AdvancedSection />);

    expect(screen.getByText('Performance & Throughput')).toBeInTheDocument();
    expect(screen.getByLabelText('Cache TTL (days)')).toBeInTheDocument();
    expect(screen.getByLabelText('Max Cache Size (MB)')).toBeInTheDocument();
    expect(screen.getByLabelText('Max Batch Characters')).toBeInTheDocument();

    const cacheTTLInput = screen.getByLabelText('Cache TTL (days)') as HTMLInputElement;
    const maxCacheSizeInput = screen.getByLabelText('Max Cache Size (MB)') as HTMLInputElement;
    const maxBatchCharsInput = screen.getByLabelText('Max Batch Characters') as HTMLInputElement;

    expect(cacheTTLInput.value).toBe('30');
    expect(maxCacheSizeInput.value).toBe('100');
    expect(maxBatchCharsInput.value).toBe('2000');

    expect(screen.getByText('How long translations are cached before expiration.')).toBeInTheDocument();
    expect(screen.getByText('Maximum storage limit for the translation cache.')).toBeInTheDocument();
    expect(screen.getByText('Maximum characters sent per translation batch.')).toBeInTheDocument();
  });

  it.each([
    ['cacheTTL', 'Cache TTL (days)', '0', 'Must be between 1 and 365 days'],
    ['cacheTTL', 'Cache TTL (days)', '400', 'Must be between 1 and 365 days'],
    ['maxCacheSize', 'Max Cache Size (MB)', '5', 'Must be between 10 and 1000 MB'],
    ['maxCacheSize', 'Max Cache Size (MB)', '1500', 'Must be between 10 and 1000 MB'],
    ['maxBatchChars', 'Max Batch Characters', '100', 'Must be between 500 and 10000 characters'],
    ['maxBatchChars', 'Max Batch Characters', '15000', 'Must be between 500 and 10000 characters'],
  ])('shows validation error for %s with value %s', (_field, label, value, error) => {
    render(<AdvancedSection />);

    const input = screen.getByLabelText(label);
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);

    expect(screen.getByText(error)).toBeInTheDocument();
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

  it('renders LLM Page Category Detection and Context-Aware Translation toggles', () => {
    render(<AdvancedSection />);
    expect(screen.getByText('LLM-based Page Category Detection')).toBeInTheDocument();
    expect(screen.getByText('Auto-detect page topic using LLM for better terminology. Requires background API call.')).toBeInTheDocument();
    expect(screen.getByText('Context-Aware Translation')).toBeInTheDocument();
    expect(screen.getByText('Inject page title, description, and domain into translation prompts for more consistent terminology.')).toBeInTheDocument();
  });

  it('toggles LLM Page Category Detection on click', () => {
    render(<AdvancedSection />);
    const toggle = screen.getByRole('switch', { name: /LLM-based Page Category Detection/i });
    fireEvent.click(toggle);
    expect(mockUpdateSettings).toHaveBeenCalledWith({ enableLLMPageCategoryDetection: true });
  });

  it('disables the LLM-detection toggle when Context-Aware Translation is off (a11y)', () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const s = { ...mockSettings, enableContextAwareTranslation: false, updateSettings: mockUpdateSettings, resetToDefaults: mockResetToDefaults };
      return typeof selector === 'function' ? selector(s) : s;
    });
    render(<AdvancedSection />);
    const toggle = screen.getByRole('switch', { name: /LLM-based Page Category Detection/i });
    expect(toggle).toBeDisabled();
  });

  it('hides Detection Mode behind an AdvancedDisclosure until expanded (FR-4)', () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const s = { ...mockSettings, enableLLMPageCategoryDetection: true, updateSettings: mockUpdateSettings, resetToDefaults: mockResetToDefaults };
      return typeof selector === 'function' ? selector(s) : s;
    });
    render(<AdvancedSection />);
    // Collapsed by default — the Detection Mode select is not in the DOM.
    expect(screen.queryByLabelText('Detection Mode')).not.toBeInTheDocument();
    // Expand the disclosure → the select appears.
    fireEvent.click(screen.getByRole('button', { name: /detection mode/i }));
    expect(screen.getByLabelText('Detection Mode')).toBeInTheDocument();
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

  it('renders the PDF Translator card with auto-open off, new-tab mode, and no never-open list', () => {
    render(<AdvancedSection />);
    expect(screen.getByText('PDF Translator')).toBeInTheDocument();
    const autoOpenSelect = screen.getByLabelText('Auto-open mode') as HTMLSelectElement;
    expect(autoOpenSelect.value).toBe('off');
    const openModeSelect = screen.getByLabelText('Open mode') as HTMLSelectElement;
    expect(openModeSelect.value).toBe('new-tab');
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

  it('renders the Max RPM input within Performance & Throughput (default 0, unlimited hint)', () => {
    render(<AdvancedSection />);
    expect(screen.getByText('Performance & Throughput')).toBeInTheDocument();
    expect(screen.getByLabelText('Max requests per minute')).toBeInTheDocument();
    const input = screen.getByLabelText('Max requests per minute') as HTMLInputElement;
    expect(input.value).toBe('0');
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

  it.each([
    ['-1', 'negative'],
    ['601', 'above 600'],
    ['3.5', 'non-integer'],
  ])('shows error for value %s (%s)', (value) => {
    render(<AdvancedSection />);
    const input = screen.getByLabelText('Max requests per minute');
    fireEvent.change(input, { target: { value } });
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

  it('renders the Translation System Prompt card with the editor', () => {
    render(<AdvancedSection />);
    expect(screen.getByText('Translation System Prompt')).toBeInTheDocument();
    const promptTextarea = document.getElementById('advanced-system-prompt') as HTMLTextAreaElement;
    expect(promptTextarea).toBeTruthy();
  });

  it('updates customSystemPrompt on change', () => {
    render(<AdvancedSection />);
    const promptTextarea = document.getElementById('advanced-system-prompt') as HTMLTextAreaElement;
    fireEvent.change(promptTextarea, { target: { value: 'Translate to {{targetLanguage}} please' } });
    expect(mockUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ customSystemPrompt: 'Translate to {{targetLanguage}} please' }),
    );
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

describe('AdvancedSection - Hero Status Strip (FR-3/FR-8)', () => {
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
    customSystemPrompt: 'custom prompt' as string | null,
    debugMode: true,
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
    vi.mocked(getCacheStats).mockResolvedValue({ entryCount: 0, totalSizeBytes: 0 });
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const s = { ...baseSettings, updateSettings: mockUpdateSettings, resetToDefaults: mockResetToDefaults };
      return typeof selector === 'function' ? selector(s) : s;
    });
  });

  it('renders the live cache usage readout from useCacheStats', async () => {
    vi.mocked(getCacheStats).mockResolvedValue({ entryCount: 42, totalSizeBytes: 2 * 1024 * 1024 });
    render(<AdvancedSection />);
    expect(await screen.findByText(/42 entries/)).toBeInTheDocument();
    expect(screen.getByText(/2\.0 MB/)).toBeInTheDocument();
  });

  it('shows Custom prompt + Debug on chips when those states are active', async () => {
    render(<AdvancedSection />);
    expect(await screen.findByText('Custom prompt')).toBeInTheDocument();
    expect(screen.getByText('Debug on')).toBeInTheDocument();
  });

  it('hides the Custom prompt chip when the prompt is at default (null)', async () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const s = { ...baseSettings, customSystemPrompt: null, updateSettings: mockUpdateSettings, resetToDefaults: mockResetToDefaults };
      return typeof selector === 'function' ? selector(s) : s;
    });
    render(<AdvancedSection />);
    // allow the cache readout to settle (mount effect) before asserting absence
    await screen.findByText(/0 entries/);
    expect(screen.queryByText('Custom prompt')).not.toBeInTheDocument();
  });
});
