import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppearanceCard } from '@/entrypoints/options/sections/subtitles/AppearanceCard';
import { DEFAULT_SUBTITLE_SETTINGS } from '@/types/config';
import { SourceTrackCard } from '@/entrypoints/options/sections/subtitles/SourceTrackCard';
import { LANGUAGES } from '@/lib/languages';

/**
 * @vitest-environment jsdom
 */

function renderCard(overrides: Partial<typeof DEFAULT_SUBTITLE_SETTINGS> = {}) {
  const onUpdate = vi.fn();
  const utils = render(
    <AppearanceCard
      settings={{ ...DEFAULT_SUBTITLE_SETTINGS, ...overrides }}
      disabled={false}
      onUpdate={onUpdate}
    />,
  );
  return { onUpdate, ...utils };
}

describe('AppearanceCard — style presets', () => {
  it('renders five preset chips with Classic active by default, and customize controls write style overrides', () => {
    const { onUpdate } = renderCard();
    // facet: renders five preset chips with Classic active by default.
    for (const label of ['Classic', 'Netflix', 'White on black', 'Yellow on black', 'Black on white']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Netflix' })).toHaveAttribute('aria-pressed', 'false');

    // facet: customize controls write style overrides.
    fireEvent.click(screen.getByRole('button', { name: /Customize/i }));
    const color = screen.getByLabelText('Text color') as HTMLInputElement;
    fireEvent.change(color, { target: { value: '#f5c518' } });
    expect(onUpdate).toHaveBeenCalledWith({ styleOverrides: { textColor: '#f5c518' } });
  });

  it('picking a preset updates settings and clears overrides', () => {
    const { onUpdate } = renderCard({ styleOverrides: { textColor: '#ff0000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Netflix' }));
    expect(onUpdate).toHaveBeenCalledWith({ stylePreset: 'netflix', styleOverrides: {} });
  });

  it('shows a Custom badge when overrides exist and hides it after picking a preset', () => {
    const { onUpdate, rerender } = renderCard({ styleOverrides: { shadowStrength: 0.2 } });
    expect(screen.getByText('Custom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yellow on black' }));
    expect(onUpdate).toHaveBeenCalledWith({ stylePreset: 'yellow-on-black', styleOverrides: {} });
    rerender(
      <AppearanceCard
        settings={{ ...DEFAULT_SUBTITLE_SETTINGS, stylePreset: 'yellow-on-black', styleOverrides: {} }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
  });

  it('dims the backdrop slider for none background styles and keeps it enabled for box styles', () => {
    // facet: dims the backdrop slider when the effective background style is none.
    const none = renderCard({ stylePreset: 'netflix' });
    expect(none.container.querySelector('.opacity-50')).not.toBeNull();
    none.unmount();

    // facet: keeps the backdrop slider enabled for box styles.
    const box = renderCard({ stylePreset: 'classic' });
    expect(box.container.querySelector('.opacity-50')).toBeNull();
  });
});

/**
 * @vitest-environment jsdom
 */

function renderSourceTrackCard(overrides: Partial<typeof DEFAULT_SUBTITLE_SETTINGS> = {}) {
  const onUpdate = vi.fn();
  const utils = render(
    <SourceTrackCard
      settings={{ ...DEFAULT_SUBTITLE_SETTINGS, ...overrides }}
      disabled={false}
      onUpdate={onUpdate}
    />,
  );
  return { onUpdate, ...utils };
}

describe('SourceTrackCard — preferred source language', () => {
  it('offers an explicit Auto option alongside every catalog language (MAX-36)', () => {
    renderSourceTrackCard();

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const values = Array.from(select.options).map((option) => option.value);

    // 'auto' means "use whichever track the platform activated", which is the
    // only way to translate a track that does not match a fixed preference.
    expect(values).toContain('auto');
    expect(values.filter((value) => value === 'auto')).toHaveLength(1);
    expect(values).toHaveLength(LANGUAGES.length);
    expect(values).toContain('en');
    expect(values).toContain('nb');

    const autoOption = Array.from(select.options).find((option) => option.value === 'auto');
    expect(autoOption?.textContent).toMatch(/auto/i);
    expect(autoOption?.textContent).toMatch(/active track/i);
  });

  it('selecting Auto updates the preference and keeps English as the default', () => {
    const { onUpdate } = renderSourceTrackCard({ preferredSubtitleLanguage: 'en' });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('en');

    fireEvent.change(select, { target: { value: 'auto' } });
    expect(onUpdate).toHaveBeenCalledWith({ preferredSubtitleLanguage: 'auto' });
  });
});
