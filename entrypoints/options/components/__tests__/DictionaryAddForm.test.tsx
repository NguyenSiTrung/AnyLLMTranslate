/**
 * DictionaryAddForm — inline add validation and keyboard.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DictionaryAddForm } from '../DictionaryAddForm';

describe('DictionaryAddForm', () => {
  it('submits on Enter when both fields filled; shows error; cancel fires', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const onSourceChange = vi.fn();
    const onTargetChange = vi.fn();
    const { rerender } = render(
      <DictionaryAddForm
        source="foo"
        target="bar"
        onSourceChange={onSourceChange}
        onTargetChange={onTargetChange}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText('Source term'), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();

    rerender(
      <DictionaryAddForm
        source="foo"
        target="bar"
        error="This source term already exists"
        onSourceChange={onSourceChange}
        onTargetChange={onTargetChange}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText('This source term already exists')).toBeInTheDocument();
  });

  it('disables Add when a field is empty', () => {
    render(
      <DictionaryAddForm
        source="foo"
        target="  "
        onSourceChange={vi.fn()}
        onTargetChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });
});
