import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemePreview } from '../ThemePreview';
import { useSettingsStore } from '@/stores/settingsStore';
import type { ThemeName } from '@/types/config';

// Mock the settings store
vi.mock('@/stores/settingsStore');

// Import the CSS to ensure it's available in tests
import '@/styles/inject.css';

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

  it('applies different theme when settings change', () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      theme: 'blockquote',
    });

    const { container } = render(<ThemePreview />);

    const previewContainer = container.querySelector('[data-lingua-theme]');
    expect(previewContainer).toHaveAttribute('data-lingua-theme', 'blockquote');
  });

  it('applies bubble theme correctly', () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      theme: 'bubble',
    });

    const { container } = render(<ThemePreview />);

    const previewContainer = container.querySelector('[data-lingua-theme]');
    expect(previewContainer).toHaveAttribute('data-lingua-theme', 'bubble');
  });

  it('applies minimal theme correctly', () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      theme: 'minimal',
    });

    const { container } = render(<ThemePreview />);

    const previewContainer = container.querySelector('[data-lingua-theme]');
    expect(previewContainer).toHaveAttribute('data-lingua-theme', 'minimal');
  });

  it('renders all 16 theme names correctly', () => {
    const themes: Array<ThemeName> = [
      'dividing-line',
      'blockquote',
      'paper',
      'underline',
      'dashed-underline',
      'highlight',
      'wavy-underline',
      'bubble',
      'side-by-side',
      'mask',
      'fade-in',
      'italic',
      'dotted-border',
      'shadow-card',
      'minimal',
      'gradient-accent',
    ];

    themes.forEach((theme) => {
      (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ theme });

      const { container, unmount } = render(<ThemePreview />);

      const previewContainer = container.querySelector('[data-lingua-theme]');
      expect(previewContainer).toHaveAttribute('data-lingua-theme', theme);

      unmount();
    });
  });

  it('updates preview when theme changes in settings store', () => {
    // Initial theme
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      theme: 'dividing-line',
    });

    const { container, rerender } = render(<ThemePreview />);

    let previewContainer = container.querySelector('[data-lingua-theme]');
    expect(previewContainer).toHaveAttribute('data-lingua-theme', 'dividing-line');

    // Change theme
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      theme: 'blockquote',
    });

    rerender(<ThemePreview />);

    previewContainer = container.querySelector('[data-lingua-theme]');
    expect(previewContainer).toHaveAttribute('data-lingua-theme', 'blockquote');
  });
});
