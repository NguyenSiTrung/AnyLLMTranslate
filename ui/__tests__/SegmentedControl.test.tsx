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

  it('uses a 2-column grid layout when there are 4+ options', () => {
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
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Register' });
    expect(group.className).toMatch(/grid-cols-2/);
    expect(screen.getByRole('radio', { name: 'Casual' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Neutral' })).toBeInTheDocument();
  });
});
