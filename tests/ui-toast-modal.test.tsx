/**
 * Tests for Toast, ToastProvider, and Modal components.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '@/ui/Modal';

// === Modal ===
describe('Modal', () => {
  it('calls onConfirm when confirm button clicked', () => {
    const onConfirm = vi.fn();
    render(
      <Modal
        title="Confirm"
        message="Are you sure?"
        onConfirm={onConfirm}
        onCancel={() => {}}
        confirmLabel="Yes"
      />
    );
    fireEvent.click(screen.getByText('Yes'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel on Escape key', () => {
    const onCancel = vi.fn();
    render(
      <Modal
        title="Confirm"
        message="Msg"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('has aria-modal attribute', () => {
    render(
      <Modal
        title="Dialog"
        message="Content"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
  });
});
