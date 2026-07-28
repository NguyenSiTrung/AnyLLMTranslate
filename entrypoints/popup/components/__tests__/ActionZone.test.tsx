/**
 * ActionZone — CTA / recovery / progress strip smoke tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionZone } from '../ActionZone';

describe('ActionZone', () => {
  it('renders ready, setup-recovery, and progress states', () => {
    // ready
    const onToggle = vi.fn();
    const ready = render(
      <ActionZone
        kind="ready"
        onTranslateToggle={onToggle}
        progressLabel=""
        progressDetail=""
        progressPercent={0}
        showProgress={false}
        isActive={false}
        unsupported={null}
      />,
    );
    const btn = screen.getByRole('button', { name: /translate page/i });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalled();
    ready.unmount();

    // setup-recovery
    const setupRender = render(
      <ActionZone
        kind="setup"
        onTranslateToggle={() => {}}
        progressLabel=""
        progressDetail=""
        progressPercent={0}
        showProgress={false}
        isActive={false}
        unsupported={null}
        recovery={{
          title: 'Provider not ready',
          description: 'Add a provider',
          action: 'Enter URL',
          canTest: false,
          onSetup: () => {},
          onTest: () => {},
          setupLabel: 'Set up provider',
        }}
      />,
    );
    expect(screen.getByText('Provider not ready')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /translate page/i })).toBeNull();
    setupRender.unmount();

    // progress
    render(
      <ActionZone
        kind="translating"
        onTranslateToggle={() => {}}
        progressLabel="Translating..."
        progressDetail="3 of 10 completed"
        progressPercent={30}
        showProgress
        isActive
        unsupported={null}
      />,
    );
    expect(screen.getByRole('button', { name: /restore original/i })).toBeTruthy();
    expect(screen.getByText(/3 of 10/i)).toBeTruthy();
    expect(screen.getByText('30%')).toBeTruthy();
  });
});
