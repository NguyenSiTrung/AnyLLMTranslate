import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentedControl } from '@/ui/SegmentedControl';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
] as const;

describe('SegmentedControl', () => {
  it('applies accent styles, fires onChange, and supports row/grid layouts', () => {
    const { rerender } = render(
      <SegmentedControl label="Test" options={[...OPTIONS]} value="a" onChange={() => {}} />,
    );
    expect(screen.getByRole('radio', { name: 'Alpha' }).className).toMatch(/bg-blue-600/);

    rerender(
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

    const onChange = vi.fn();
    rerender(
      <SegmentedControl label="Test" options={[...OPTIONS]} value="a" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');

    const four = [
      { value: '7d', label: '7d' },
      { value: '30d', label: '30d' },
      { value: '90d', label: '90d' },
      { value: 'all', label: 'All' },
    ] as const;
    rerender(
      <SegmentedControl label="Range" options={[...four]} value="30d" onChange={() => {}} />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Range' }).className).toMatch(/inline-flex/);
    expect(screen.getByRole('radiogroup', { name: 'Range' }).className).not.toMatch(/grid-cols-2/);

    const register = [
      { value: 'auto', label: 'Auto' },
      { value: 'formal', label: 'Formal' },
      { value: 'neutral', label: 'Neutral' },
      { value: 'casual', label: 'Casual' },
    ] as const;
    rerender(
      <SegmentedControl
        label="Register"
        options={[...register]}
        value="auto"
        onChange={() => {}}
        layout="grid"
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Register' }).className).toMatch(/grid-cols-2/);
    expect(screen.getByRole('radio', { name: 'Casual' })).toBeInTheDocument();
  });
});
