/**
 * Tests: Website compatibility card — preset-first presentation with
 * individual controls collapsed behind a disclosure and outcome labels.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { ToastProvider } from '@/ui/ToastProvider';
import { WebsiteCompatibilityCard } from '../WebsiteCompatibilityCard';

function renderCompatibility(overrides: Partial<ExtensionSettings> = {}) {
  const updateSettings = vi.fn();
  useSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    ...overrides,
    isLoaded: true,
    updateSettings,
  } as never);
  render(
    <ToastProvider>
      <WebsiteCompatibilityCard />
    </ToastProvider>,
  );
  return { updateSettings };
}

describe('WebsiteCompatibilityCard', () => {
  it('marks Balanced as recommended', () => {
    renderCompatibility();
    expect(screen.getByLabelText(/page coverage preset/i)).toHaveValue(
      'balanced',
    );
    // Header badge is exactly "Recommended"; the preset description begins
    // "Recommended: …" — exact text isolates the badge.
    expect(screen.getByText('Recommended')).toBeInTheDocument();
  });

  it('detects Custom when toggles diverge from a named preset', () => {
    renderCompatibility({
      enableAsideCaps: false,
      enableBodyTagWhitelist: true,
    });
    expect(screen.getByLabelText(/page coverage preset/i)).toHaveValue('custom');
  });

  it('keeps individual compatibility controls collapsed by default', () => {
    renderCompatibility();
    const trigger = screen.getByRole('button', {
      name: /individual compatibility controls/i,
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('switch', {
        name: /translate text inside web components/i,
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(
      screen.getByRole('switch', {
        name: /translate text inside web components/i,
      }),
    ).toBeInTheDocument();
  });

  it('applies a named preset through the same settings keys', () => {
    const { updateSettings } = renderCompatibility();
    fireEvent.change(screen.getByLabelText(/page coverage preset/i), {
      target: { value: 'classic' },
    });
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ enableStreamingTranslation: false }),
    );
  });
});
