/**
 * Tests: PDF bridge status panel — one readiness state with a single
 * state-appropriate primary action.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PdfStatusPanel } from '../PdfStatusPanel';

function renderPanel(status: 'not_configured' | 'offline' | 'ready') {
  return render(
    <PdfStatusPanel
      status={status}
      checking={false}
      error={null}
      onSetup={vi.fn()}
      onRefresh={vi.fn()}
      onShowUsage={vi.fn()}
    />,
  );
}

describe('PdfStatusPanel', () => {
  it.each([
    ['not_configured', 'Not configured', 'Set up PDF translation'],
    ['offline', 'Bridge offline', 'Check connection'],
    ['ready', 'Ready', 'How to translate a PDF'],
  ] as const)('renders %s state with its primary action', (status, label, action) => {
    renderPanel(status);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: action })).toBeInTheDocument();
  });
});
