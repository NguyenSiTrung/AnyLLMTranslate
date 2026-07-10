import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentedControl } from '@/ui/SegmentedControl';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
] as const;

describe('SegmentedControl', () => {
  it('uses blue active styles by default', () => {
    render(
      <SegmentedControl
        label="Test"
        options={[...OPTIONS]}
        value="a"
        onChange={() => {}}
      />,
    );
    const active = screen.getByRole('radio', { name: 'Alpha' });
    expect(active.className).toMatch(/bg-blue-600/);
  });

  it('uses cyan active styles when accent is cyan', () => {
    render(
      <SegmentedControl
        label="Test"
        options={[...OPTIONS]}
        value="a"
        onChange={() => {}}
        accent="cyan"
      />,
    );
    const active = screen.getByRole('radio', { name: 'Alpha' });
    expect(active.className).toMatch(/bg-cyan-600/);
    expect(active.className).not.toMatch(/bg-blue-600/);
  });

  it('calls onChange when selecting another option', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Test"
        options={[...OPTIONS]}
        value="a"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('keeps a single-row layout by default even with 4 options', () => {
    const four = [
      { value: '7d', label: '7d' },
      { value: '30d', label: '30d' },
      { value: '90d', label: '90d' },
      { value: 'all', label: 'All' },
    ] as const;
    render(
      <SegmentedControl
        label="Range"
        options={[...four]}
        value="30d"
        onChange={() => {}}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Range' });
    expect(group.className).toMatch(/inline-flex/);
    expect(group.className).not.toMatch(/grid-cols-2/);
  });

  it('uses a 2-column grid when layout is grid', () => {
    const four = [
      { value: 'auto', label: 'Auto' },
      { value: 'formal', label: 'Formal' },
      { value: 'neutral', label: 'Neutral' },
      { value: 'casual', label: 'Casual' },
    ] as const;
    render(
      <SegmentedControl
        label="Register"
        options={[...four]}
        value="auto"
        onChange={() => {}}
        layout="grid"
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Register' });
    expect(group.className).toMatch(/grid-cols-2/);
    expect(screen.getByRole('radio', { name: 'Casual' })).toBeInTheDocument();
  });
});
