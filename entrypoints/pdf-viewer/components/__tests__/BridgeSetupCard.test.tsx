import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BridgeSetupCard } from '../BridgeSetupCard';

describe('BridgeSetupCard', () => {
  it('covers offline setup copy and configured setup, refresh, and dismiss actions', () => {
    render(
      <BridgeSetupCard
        status="offline"
        onRefresh={vi.fn()}
        onOpenSetup={vi.fn()}
      />,
    );
    expect(screen.getByText(/not available/i)).toBeTruthy();
    expect(screen.getByText(/scientific-pdf-docker\.sh up/)).toBeTruthy();
    const guideLink = screen.getByRole('link', { name: /full setup guide/i });
    expect(guideLink).toHaveAttribute('href', 'https://nguyensitrung.github.io/AnyLLMTranslate/guide/');
    expect(guideLink).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('button', { name: /^Translate$/i })).toBeNull();
    expect(screen.queryByText(/fast translation/i)).toBeNull();
    cleanup();

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
