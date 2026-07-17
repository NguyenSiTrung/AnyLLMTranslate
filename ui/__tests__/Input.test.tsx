/**
 * Input — suffix sits outside the field so values stay readable.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from '../Input';

describe('Input suffix', () => {
  it('renders unit outside input and hides number spinners', () => {
    const { container, rerender } = render(
      <Input type="number" value={20} onChange={() => {}} suffix="req/min" />,
    );

    const input = screen.getByDisplayValue('20');
    const unit = screen.getByText('req/min');

    expect(unit).toBeInTheDocument();
    expect(unit.className).not.toMatch(/absolute/);
    expect(input.className).not.toMatch(/pr-\[4\.5rem\]/);
    const row = unit.parentElement;
    expect(row?.className).toMatch(/flex/);
    expect(container.querySelector('input')).toBe(input);

    rerender(<Input type="number" value={1} onChange={() => {}} suffix="at once" />);
    const spinnerInput = screen.getByDisplayValue('1');
    expect(spinnerInput.className).toMatch(/appearance:textfield|appearance-none/);
  });
});
