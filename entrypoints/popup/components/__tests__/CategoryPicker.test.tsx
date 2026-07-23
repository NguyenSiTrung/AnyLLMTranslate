/**
 * CategoryPicker — portal menu, search, custom draft, source chip.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CategoryPicker } from '../CategoryPicker';

function renderPicker(overrides: Partial<ComponentProps<typeof CategoryPicker>> = {}) {
  const props = {
    currentValue: '__auto__',
    isCustomEntry: false,
    detectedCategory: 'News',
    customCategoryInput: '',
    onCategoryChange: vi.fn(),
    onCustomInputChange: vi.fn(),
    onCustomSubmit: vi.fn(),
    showSaveAsRule: false,
    onSaveAsRule: vi.fn(),
    activeHostname: 'example.com',
    sourceKind: 'auto' as const,
    ...overrides,
  };
  const result = render(<CategoryPicker {...props} />);
  return { ...result, props };
}

describe('CategoryPicker', () => {
  beforeEach(() => {
    // jsdom layout: give the trigger a box so portal positioning runs
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 40,
        bottom: 80,
        left: 10,
        right: 300,
        width: 290,
        height: 40,
        x: 10,
        y: 40,
        toJSON: () => ({}),
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows Auto chip and detected label when closed', () => {
    renderPicker({ sourceKind: 'auto', detectedCategory: 'News' });
    expect(screen.getByText('Auto')).toBeTruthy();
    expect(screen.getByText('News')).toBeTruthy();
  });

  it('shows This tab chip for tab overrides', () => {
    renderPicker({
      sourceKind: 'tab',
      currentValue: 'Gaming',
      detectedCategory: undefined,
    });
    expect(screen.getByText('This tab')).toBeTruthy();
    expect(screen.getByText('Gaming')).toBeTruthy();
  });

  it('opens a portaled listbox with Auto and groups', async () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /category/i }));
    await waitFor(() => {
      expect(screen.getByRole('listbox', { name: /page category/i })).toBeTruthy();
    });
    expect(screen.getByRole('option', { name: /auto detect/i })).toBeTruthy();
    expect(screen.getByText('Development')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Software Development' })).toBeTruthy();
  });

  it('filters with correct Auto search direction', async () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /category/i }));
    const input = await screen.findByPlaceholderText(/filter categories/i);
    // Old inverted check was `'auto'.includes(q)` — "detect" failed that; label.includes works.
    fireEvent.change(input, { target: { value: 'detect' } });
    expect(screen.getByRole('option', { name: /auto detect/i })).toBeTruthy();
    fireEvent.change(input, { target: { value: 'xyznope' } });
    expect(screen.queryByRole('option', { name: /auto detect/i })).toBeNull();
    fireEvent.change(input, { target: { value: 'soft' } });
    expect(screen.getByRole('option', { name: 'Software Development' })).toBeTruthy();
  });

  it('selects a category and closes', async () => {
    const { props } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /category/i }));
    const opt = await screen.findByRole('option', { name: 'News' });
    fireEvent.click(opt);
    expect(props.onCategoryChange).toHaveBeenCalledWith('News');
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).toBeNull();
    });
  });

  it('keeps custom draft editable inside the panel', async () => {
    const onCustomInputChange = vi.fn();
    renderPicker({
      currentValue: 'My Cat',
      isCustomEntry: true,
      customCategoryInput: 'My Cat',
      onCustomInputChange,
      sourceKind: 'tab',
    });
    fireEvent.click(screen.getByRole('button', { name: /category/i }));
    fireEvent.click(await screen.findByRole('option', { name: /custom category/i }));
    const draft = await screen.findByPlaceholderText(/scientific paper/i);
    expect((draft as HTMLInputElement).value).toBe('My Cat');
    fireEvent.change(draft, { target: { value: 'My Cat edited' } });
    expect(onCustomInputChange).toHaveBeenCalledWith('My Cat edited');
  });

  it('closes on Escape', async () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /category/i }));
    await screen.findByRole('listbox');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).toBeNull();
    });
  });

  it('shows save-as-rule with truncated host and flash label', async () => {
    const onSaveAsRule = vi.fn();
    renderPicker({
      showSaveAsRule: true,
      onSaveAsRule,
      activeHostname: 'very-long-subdomain.example-documentation.com',
      sourceKind: 'tab',
      currentValue: 'News',
    });
    const saveBtn = screen.getByRole('button', { name: /save as site rule/i });
    expect(saveBtn.textContent).toMatch(/…/);
    fireEvent.click(saveBtn);
    expect(onSaveAsRule).toHaveBeenCalled();
    expect(screen.getByText(/saved as site rule/i)).toBeTruthy();
  });
});
