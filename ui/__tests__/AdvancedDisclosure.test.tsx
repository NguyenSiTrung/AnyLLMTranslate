/**
 * Tests for the AdvancedDisclosure primitive (FR-5).
 */

import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdvancedDisclosure } from '../AdvancedDisclosure';

describe('AdvancedDisclosure', () => {
  it('is collapsed by default (children not rendered)', () => {
    render(
      <AdvancedDisclosure label="Advanced settings">
        <div>hidden content</div>
      </AdvancedDisclosure>,
    );
    expect(screen.queryByText('hidden content')).not.toBeInTheDocument();
  });

  it('reveals the children when the trigger is clicked', () => {
    render(
      <AdvancedDisclosure label="Advanced settings">
        <div>hidden content</div>
      </AdvancedDisclosure>,
    );
    fireEvent.click(screen.getByRole('button', { name: /advanced settings/i }));
    expect(screen.getByText('hidden content')).toBeInTheDocument();
  });

  it('collapses again on a second click', () => {
    render(
      <AdvancedDisclosure label="Advanced settings">
        <div>hidden content</div>
      </AdvancedDisclosure>,
    );
    const trigger = screen.getByRole('button', { name: /advanced settings/i });
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByText('hidden content')).not.toBeInTheDocument();
  });

  it('respects defaultExpanded', () => {
    render(
      <AdvancedDisclosure label="Advanced settings" defaultExpanded>
        <div>hidden content</div>
      </AdvancedDisclosure>,
    );
    expect(screen.getByText('hidden content')).toBeInTheDocument();
  });

  it('pairs the trigger and region with aria-expanded / aria-controls / role=region', () => {
    render(
      <AdvancedDisclosure label="Advanced settings">
        <div>hidden content</div>
      </AdvancedDisclosure>,
    );
    const trigger = screen.getByRole('button', { name: /advanced settings/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const regionId = trigger.getAttribute('aria-controls');
    const region = document.getElementById(regionId ?? '');
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute('role', 'region');
    expect(region).toHaveAttribute('aria-labelledby', trigger.getAttribute('id') ?? '');
  });

  it('rotates the chevron when expanded', () => {
    const { container } = render(
      <AdvancedDisclosure label="Advanced settings">
        <div>hidden content</div>
      </AdvancedDisclosure>,
    );
    const chevron = container.querySelector('[class*="lucide-chevron-down"]') as SVGElement | null;
    expect(chevron).not.toBeNull();
    expect(chevron).not.toHaveClass('rotate-180');

    fireEvent.click(screen.getByRole('button', { name: /advanced settings/i }));
    expect(chevron).toHaveClass('rotate-180');
  });
});
