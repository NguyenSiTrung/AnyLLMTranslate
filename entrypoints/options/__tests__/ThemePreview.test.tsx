import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemePreview } from '../ThemePreview';
import { useSettingsStore } from '@/stores/settingsStore';

// Mock the settings store
vi.mock('@/stores/settingsStore');

describe('ThemePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the theme preview card', () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      theme: 'dividing-line',
    });

    render(<ThemePreview />);

    expect(screen.getByText('Theme Preview')).toBeInTheDocument();
  });

  it('displays bilingual sample text', () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      theme: 'dividing-line',
    });

    render(<ThemePreview />);

    expect(screen.getByText('The quick brown fox jumps over the lazy dog.')).toBeInTheDocument();
    expect(screen.getByText('El rápido zorro marrón salta sobre el perro perezoso.')).toBeInTheDocument();
  });

  it('applies the current theme from settings', () => {
    const mockSettings = { theme: 'blockquote' };
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockSettings);

    const { container } = render(<ThemePreview />);

    const previewContainer = container.querySelector('[data-lingua-theme]');
    expect(previewContainer).toHaveAttribute('data-lingua-theme', 'blockquote');
  });

  it('sets dual state for bilingual display', () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      theme: 'dividing-line',
    });

    const { container } = render(<ThemePreview />);

    const previewContainer = container.querySelector('[data-lingua-state]');
    expect(previewContainer).toHaveAttribute('data-lingua-state', 'dual');
  });

  it('marks original text with role attribute', () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      theme: 'dividing-line',
    });

    const { container } = render(<ThemePreview />);

    const originalText = container.querySelector('[data-lingua-role="original"]');
    expect(originalText).toBeInTheDocument();
    expect(originalText).toHaveTextContent('The quick brown fox jumps over the lazy dog.');
  });

  it('marks translated text with role and lingua-lens-translation class', () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      theme: 'dividing-line',
    });

    const { container } = render(<ThemePreview />);

    const translatedText = container.querySelector('[data-lingua-role="translation"]');
    expect(translatedText).toBeInTheDocument();
    expect(translatedText).toHaveClass('lingua-lens-translation');
    expect(translatedText).toHaveTextContent('El rápido zorro marrón salta sobre el perro perezoso.');
  });
});
