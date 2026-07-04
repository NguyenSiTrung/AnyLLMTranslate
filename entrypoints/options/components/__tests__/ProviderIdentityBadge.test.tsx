/**
 * Tests for the ProviderIdentityBadge component (FR-2).
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProviderIdentityBadge } from '../ProviderIdentityBadge';

describe('ProviderIdentityBadge', () => {
  it('renders the monogram text', () => {
    const { getByText } = render(<ProviderIdentityBadge accent="orange" monogram="GQ" />);
    expect(getByText('GQ')).toBeInTheDocument();
  });

  it.each([
    ['blue', 'bg-blue-600/15'],
    ['pink', 'bg-pink-600/15'],
    ['emerald', 'bg-emerald-600/15'],
    ['amber', 'bg-amber-600/15'],
    ['zinc', 'bg-zinc-600/15'],
    ['teal', 'bg-teal-600/15'],
    ['cyan', 'bg-cyan-600/15'],
    ['orange', 'bg-orange-600/15'],
  ] as const)('uses the readiness-banner token pattern for accent %s', (accent, bgClass) => {
    const { container } = render(
      <ProviderIdentityBadge accent={accent} monogram="X" />,
    );
    const badge = container.querySelector('span');
    expect(badge).toHaveClass(bgClass);
    expect(badge).toHaveClass('border'); // has a border color too
  });

  it('uses the NFR-4 opacity triplet (bg-/15 border-/20 text-/400)', () => {
    const { container } = render(
      <ProviderIdentityBadge accent="emerald" monogram="NV" />,
    );
    const badge = container.querySelector('span');
    expect(badge).not.toBeNull();
    expect(badge?.className).toMatch(/bg-emerald-600\/15/);
    expect(badge?.className).toMatch(/border-emerald-500\/20/);
    expect(badge?.className).toMatch(/text-emerald-400/);
  });

  it('is aria-hidden (the header text conveys the name)', () => {
    const { container } = render(<ProviderIdentityBadge accent="zinc" monogram="OR" />);
    expect(container.querySelector('span')).toHaveAttribute('aria-hidden', 'true');
  });

  it('dims the badge when the provider is disabled', () => {
    const { container } = render(
      <ProviderIdentityBadge accent="zinc" monogram="OR" enabled={false} />,
    );
    expect(container.querySelector('span')).toHaveClass('opacity-60');
  });

  it('does not dim the badge when enabled', () => {
    const { container } = render(
      <ProviderIdentityBadge accent="zinc" monogram="OR" enabled={true} />,
    );
    expect(container.querySelector('span')).not.toHaveClass('opacity-60');
  });
});
