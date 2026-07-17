/**
 * Input — suffix sits outside the field so values stay readable.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from '../Input';

describe('Input suffix', () => {
  it('renders unit outside the input (sibling), not overlapping the value', () => {
    const { container } = render(
      <Input type="number" value={20} onChange={() => {}} suffix="req/min" />,
    );

    const input = screen.getByDisplayValue('20');
    const unit = screen.getByText('req/min');

    expect(unit).toBeInTheDocument();
    // Unit must not be positioned over the input (absolute right).
    expect(unit.className).not.toMatch(/absolute/);
    // Value field keeps normal horizontal padding (no pr-[4.5rem] squeeze).
    expect(input.className).not.toMatch(/pr-\[4\.5rem\]/);
    // Layout is a flex row of input + unit.
    const row = unit.parentElement;
    expect(row?.className).toMatch(/flex/);
    expect(container.querySelector('input')).toBe(input);
  });

  it('hides number spinners that would eat the right edge', () => {
    render(<Input type="number" value={1} onChange={() => {}} suffix="at once" />);
    const input = screen.getByDisplayValue('1');
    expect(input.className).toMatch(/appearance:textfield|appearance-none/);
  });
});
