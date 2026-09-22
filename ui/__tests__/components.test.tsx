import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Drawer } from '../Drawer';
import { Input } from '../Input';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { ToastProvider, useToast } from '@/ui/ToastProvider';
import type { ToastAction } from '@/ui/Toast';

describe('Drawer', () => {
  it('renders when open, hides when closed, closes on Escape, and handles onClose identity changes without stealing focus', () => {
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

    // Does not steal focus from inputs when onClose identity changes while open.
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

    // Still calls the latest onClose after parent re-renders with a new callback.
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    const { rerender: rerender2 } = render(
      <Drawer open title="Edit provider" onClose={firstClose}>
        <p>Body</p>
      </Drawer>,
    );

    rerender2(
      <Drawer open title="Edit provider" onClose={secondClose}>
        <p>Body</p>
      </Drawer>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(firstClose).not.toHaveBeenCalled();
    expect(secondClose).toHaveBeenCalledTimes(1);
  });
});

/**
 * Input — suffix sits outside the field so values stay readable.
 */


const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
] as const;

describe('Input suffix / SegmentedControl', () => {
  it('renders the Input unit outside the field and applies SegmentedControl accents/onChange/layouts', () => {
    // facet: Input suffix renders unit outside input and hides number spinners
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

    // facet: SegmentedControl applies accent styles, fires onChange, and supports row/grid layouts
    const { rerender: segRerender } = render(
      <SegmentedControl label="Test" options={[...OPTIONS]} value="a" onChange={() => {}} />,
    );
    expect(screen.getByRole('radio', { name: 'Alpha' }).className).toMatch(/bg-blue-600/);

    segRerender(
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
    segRerender(
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
    segRerender(
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
    segRerender(
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

/**
 * Tests: Toast action-button support (used by the import Undo toast).
 */

function Harness({ action, message }: { action?: ToastAction; message: string }) {
  const { successWithAction, success } = useToast();
  return (
    <button
      type="button"
      onClick={() => (action ? successWithAction(message, action) : success(message))}
    >
      show
    </button>
  );
}

describe('Toast action', () => {
  it('renders an action button, invokes onClick and dismisses; no-action toasts stay plain', async () => {
    const onClick = vi.fn();
    const view = render(
      <ToastProvider>
        <Harness action={{ label: 'Undo import', onClick }} message="Imported 2 settings" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'show' }));
    expect(screen.getByText('Imported 2 settings')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo import' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByText('Imported 2 settings')).not.toBeInTheDocument(),
    );

    // No-action toasts render no action button and behave as before.
    view.unmount();
    render(
      <ToastProvider>
        <Harness message="Plain success" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'show' }));
    expect(screen.getByText('Plain success')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
  });
});
