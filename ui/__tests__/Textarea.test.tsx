/**
 * Tests for the Textarea primitive (FR-5 / FR-9).
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Textarea } from '../Textarea';

describe('Textarea', () => {
  it('renders the value and forwards the id', () => {
    render(<Textarea id="prompt" value="hello world" onChange={vi.fn()} />);
    const el = screen.getByDisplayValue('hello world') as HTMLTextAreaElement;
    expect(el).toHaveAttribute('id', 'prompt');
  });

  it('calls onChange when the user types', () => {
    const onChange = vi.fn();
    render(<Textarea value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'typed' } });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('applies the error border and renders the error message', () => {
    render(<Textarea value="" onChange={vi.fn()} error="Missing variable" />);
    const el = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(el.className).toContain('border-red-500/50');
    expect(screen.getByText('Missing variable')).toBeInTheDocument();
  });

  it('renders the hint only when there is no error', () => {
    const { rerender } = render(<Textarea value="" onChange={vi.fn()} hint="Use {{targetLanguage}}" />);
    expect(screen.getByText('Use {{targetLanguage}}')).toBeInTheDocument();

    rerender(<Textarea value="" onChange={vi.fn()} hint="Use {{targetLanguage}}" error="Boom" />);
    expect(screen.queryByText('Use {{targetLanguage}}')).not.toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  it('adds the font-mono class when mono is true', () => {
    render(<Textarea value="" onChange={vi.fn()} mono />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).className).toContain('font-mono');
  });

  it('honours a custom rows attribute', () => {
    render(<Textarea value="" onChange={vi.fn()} rows={8} />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).rows).toBe(8);
  });
});
