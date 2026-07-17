import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BridgeStatusPanel } from '../BridgeStatusPanel';

describe('BridgeStatusPanel', () => {
  it('shows unavailable + setup CTA when offline', () => {
    const onOpenSetup = vi.fn();
    const onRefresh = vi.fn();
    render(
      <BridgeStatusPanel
        status="offline"
        healthOk={false}
        isRunning={false}
        onRefresh={onRefresh}
        onOpenSetup={onOpenSetup}
        onTranslate={vi.fn()}
      />,
    );

    expect(screen.getByText(/PDF Translate not available/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Translate$/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Set up \/ connect bridge/i }));
    expect(onOpenSetup).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Check connection/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows Translate when bridge is ready', () => {
    const onTranslate = vi.fn();
    render(
      <BridgeStatusPanel
        status="ready"
        healthOk={true}
        isRunning={false}
        onRefresh={vi.fn()}
        onOpenSetup={vi.fn()}
        onTranslate={onTranslate}
      />,
    );

    expect(screen.getByText(/Bridge ready/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Translate$/i }));
    expect(onTranslate).toHaveBeenCalledTimes(1);
  });

  it('shows not_configured guidance', () => {
    render(
      <BridgeStatusPanel
        status="not_configured"
        healthOk={false}
        isRunning={false}
        onRefresh={vi.fn()}
        onOpenSetup={vi.fn()}
        onTranslate={vi.fn()}
      />,
    );

    expect(screen.getByText(/not available/i)).toBeTruthy();
    expect(screen.getByText(/scientific-pdf-docker\.sh up/)).toBeTruthy();
  });
});
