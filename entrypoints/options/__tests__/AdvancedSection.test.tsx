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
    theme: 'dividing-line',
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

    expect(screen.getByText('Cache Management')).toBeInTheDocument();
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
});
