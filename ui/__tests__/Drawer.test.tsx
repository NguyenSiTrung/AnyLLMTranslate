import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Drawer } from '../Drawer';

describe('Drawer', () => {
  it('renders when open, hides when closed, and closes on Escape', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Drawer open title="Edit provider" onClose={onClose}>
        <p>Body</p>
      </Drawer>,
    );
    expect(screen.getByRole('dialog', { name: 'Edit provider' })).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();

    rerender(
      <Drawer open={false} title="Edit provider" onClose={onClose}>
        <p>Body</p>
      </Drawer>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
