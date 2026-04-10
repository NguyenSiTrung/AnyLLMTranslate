/**
 * Tests for shared UI primitives — Phase 1 Task 1 & 2 components.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Select } from '@/ui/Select';
import { Card } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import { FieldGroup } from '@/ui/FieldGroup';
import { Toggle } from '@/ui/Toggle';
import { Slider } from '@/ui/Slider';
import { EmptyState } from '@/ui/EmptyState';

// === Button ===
describe('Button', () => {
  it('renders with children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeTruthy();
  });

  it('applies variant classes', () => {
    const { container } = render(<Button variant="danger">Delete</Button>);
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('bg-red-600/20');
  });

  it('shows loading spinner and disables', () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn.disabled).toBe(true);
  });

  it('calls onClick handler', () => {
    const handler = vi.fn();
    render(<Button onClick={handler}>Go</Button>);
    fireEvent.click(screen.getByText('Go'));
    expect(handler).toHaveBeenCalledOnce();
  });
});

// === Input ===
describe('Input', () => {
  it('renders with placeholder', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeTruthy();
  });

  it('shows error message', () => {
    render(<Input error="Required field" />);
    expect(screen.getByText('Required field')).toBeTruthy();
  });

  it('shows hint when no error', () => {
    render(<Input hint="Optional field" />);
    expect(screen.getByText('Optional field')).toBeTruthy();
  });

  it('toggles password visibility', () => {
    render(<Input type="password" value="secret" onChange={() => {}} />);
    const input = document.querySelector('input')!;
    expect(input.type).toBe('password');
    fireEvent.click(screen.getByLabelText('Show password'));
    expect(input.type).toBe('text');
  });
});

// === Select ===
describe('Select', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ];

  it('renders options', () => {
    render(<Select options={options} />);
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
  });

  it('fires onChange', () => {
    const handler = vi.fn();
    render(<Select options={options} onChange={handler} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } });
    expect(handler).toHaveBeenCalled();
  });
});

// === Card ===
describe('Card', () => {
  it('renders title and children', () => {
    render(<Card title="My Card">Content</Card>);
    expect(screen.getByText('My Card')).toBeTruthy();
    expect(screen.getByText('Content')).toBeTruthy();
  });

  it('applies accent border class', () => {
    const { container } = render(<Card accent="emerald">Test</Card>);
    expect(container.innerHTML).toContain('border-l-emerald-500');
  });
});

// === Badge ===
describe('Badge', () => {
  it('renders with variant', () => {
    render(<Badge variant="success">Active</Badge>);
    const badge = screen.getByText('Active');
    expect(badge.className).toContain('text-emerald-400');
  });
});

// === FieldGroup ===
describe('FieldGroup', () => {
  it('renders label and description', () => {
    render(<FieldGroup label="Name" description="Your full name"><input /></FieldGroup>);
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Your full name')).toBeTruthy();
  });

  it('renders error over hint', () => {
    render(<FieldGroup label="Email" error="Invalid" hint="Enter email"><input /></FieldGroup>);
    expect(screen.getByText('Invalid')).toBeTruthy();
    expect(screen.queryByText('Enter email')).toBeNull();
  });
});

// === Toggle ===
describe('Toggle', () => {
  it('renders with label', () => {
    render(<Toggle checked={false} onChange={() => {}} label="Enable feature" />);
    expect(screen.getByText('Enable feature')).toBeTruthy();
  });

  it('fires onChange on click', () => {
    const handler = vi.fn();
    render(<Toggle checked={false} onChange={handler} label="Toggle" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(handler).toHaveBeenCalledWith(true);
  });

  it('has aria-checked attribute', () => {
    render(<Toggle checked={true} onChange={() => {}} label="Active" />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });
});

// === Slider ===
describe('Slider', () => {
  it('renders with label and value', () => {
    render(<Slider id="vol" label="Volume" value={50} min={0} max={100} onChange={() => {}} />);
    expect(screen.getByText('Volume: 50')).toBeTruthy();
  });

  it('renders min/max labels', () => {
    render(<Slider value={5} min={0} max={10} minLabel="0%" maxLabel="100%" onChange={() => {}} />);
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('calls onChange with numeric value', () => {
    const handler = vi.fn();
    render(<Slider id="s" value={5} min={0} max={10} onChange={handler} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '7' } });
    expect(handler).toHaveBeenCalledWith(7);
  });
});

// === EmptyState ===
describe('EmptyState', () => {
  it('renders message', () => {
    render(<EmptyState message="No items found" />);
    expect(screen.getByText('No items found')).toBeTruthy();
  });

  it('renders action button when provided', () => {
    const handler = vi.fn();
    render(<EmptyState message="Empty" actionLabel="Add Item" onAction={handler} />);
    const btn = screen.getByText('Add Item');
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledOnce();
  });
});
