import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KeyCapSequence } from '../KeyCapSequence';

describe('KeyCapSequence', () => {
  it('renders nothing for empty shortcut and chips for chords', () => {
    const { container, rerender } = render(<KeyCapSequence shortcut="" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<KeyCapSequence shortcut="Alt+A" />);
    expect(screen.getByLabelText('Shortcut Alt+A')).toBeInTheDocument();
    expect(screen.getByText('Alt')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });
});
