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

  it('handles onClose identity changes: no focus steal, latest callback wins', () => {
    // does not steal focus from inputs when onClose identity changes while open
    const focusRender = render(
      <Drawer open title="Edit provider" onClose={() => {}}>
        <input aria-label="Display name" defaultValue="" />
      </Drawer>,
    );

    const input = screen.getByLabelText('Display name');
    input.focus();
    expect(document.activeElement).toBe(input);

    // Parent re-render with a new inline onClose (e.g. pool status poll every 3s)
    focusRender.rerender(
      <Drawer open title="Edit provider" onClose={() => {}}>
        <input aria-label="Display name" defaultValue="" />
      </Drawer>,
    );

    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: 'OpenAI' } });
    expect(input).toHaveValue('OpenAI');
    focusRender.unmount();

    // still calls the latest onClose after parent re-renders with a new callback
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    const { rerender } = render(
      <Drawer open title="Edit provider" onClose={firstClose}>
        <p>Body</p>
      </Drawer>,
    );

    rerender(
      <Drawer open title="Edit provider" onClose={secondClose}>
        <p>Body</p>
      </Drawer>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(firstClose).not.toHaveBeenCalled();
    expect(secondClose).toHaveBeenCalledTimes(1);
  });
});
