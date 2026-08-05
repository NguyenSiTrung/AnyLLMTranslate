/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppearanceCard } from '@/entrypoints/options/sections/subtitles/AppearanceCard';
import { DEFAULT_SUBTITLE_SETTINGS } from '@/types/config';

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
  it('renders five preset chips with Classic active by default', () => {
    renderCard();
    for (const label of ['Classic', 'Netflix', 'White on black', 'Yellow on black', 'Black on white']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Netflix' })).toHaveAttribute('aria-pressed', 'false');
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

  it('customize controls write style overrides', () => {
    const { onUpdate } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Customize/i }));
    const color = screen.getByLabelText('Text color') as HTMLInputElement;
    fireEvent.change(color, { target: { value: '#f5c518' } });
    expect(onUpdate).toHaveBeenCalledWith({ styleOverrides: { textColor: '#f5c518' } });
  });

  it('dims the backdrop slider when the effective background style is none', () => {
    const { container } = renderCard({ stylePreset: 'netflix' });
    expect(container.querySelector('.opacity-50')).not.toBeNull();
  });

  it('keeps the backdrop slider enabled for box styles', () => {
    const { container } = renderCard({ stylePreset: 'classic' });
    expect(container.querySelector('.opacity-50')).toBeNull();
  });
});
