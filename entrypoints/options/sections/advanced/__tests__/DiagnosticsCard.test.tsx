/**
 * Tests: Diagnostics card — debug logging explanation and persistence.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { DiagnosticsCard } from '../DiagnosticsCard';

describe('DiagnosticsCard', () => {
  it('explains debug logging and persists its state', () => {
    const updateSettings = vi.fn();
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      debugMode: false,
      isLoaded: true,
      updateSettings,
    } as never);
    render(<DiagnosticsCard />);
    expect(screen.getByText(/developer tools/i)).toBeInTheDocument();
    expect(
      screen.getByText(/turn it off after troubleshooting/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: /debug logging/i }));
    expect(updateSettings).toHaveBeenCalledWith({ debugMode: true });
  });
});
