import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BridgeSetupCard } from '../BridgeSetupCard';

describe('BridgeSetupCard', () => {
  it('shows setup steps and no Translate button when offline', () => {
    render(
      <BridgeSetupCard
        status="offline"
        onRefresh={vi.fn()}
        onOpenSetup={vi.fn()}
      />,
    );
    expect(screen.getByText(/not available/i)).toBeTruthy();
    expect(screen.getByText(/scientific-pdf-docker\.sh up/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Translate$/i })).toBeNull();
    expect(screen.queryByText(/fast translation/i)).toBeNull();
  });

  it('wires Set up, Check connection, and Not now dismiss', () => {
    const onOpenSetup = vi.fn();
    const onRefresh = vi.fn();
    const configured = render(
      <BridgeSetupCard
        status="not_configured"
        onRefresh={onRefresh}
        onOpenSetup={onOpenSetup}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Set up/i }));
    expect(onOpenSetup).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Check connection/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    configured.unmount();

    const onDismiss = vi.fn();
    render(
      <BridgeSetupCard
        status="offline"
        onRefresh={vi.fn()}
        onOpenSetup={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Not now/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
