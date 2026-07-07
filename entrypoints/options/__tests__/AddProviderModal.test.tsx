/**
 * Tests for the rebuilt AddProviderModal (FR-7).
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AddProviderModal } from '../components/AddProviderModal';

describe('AddProviderModal (FR-7)', () => {
  it('renders the title and grouped category dividers in Cloud → Local → Custom order', () => {
    render(<AddProviderModal onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Add provider from catalog', { selector: 'h3' })).toBeInTheDocument();
    const labels = screen.getAllByText(/^(Cloud|Local|Custom)$/).map((el) => el.textContent);
    expect(labels).toEqual(['Cloud', 'Local', 'Custom']);
  });

  it('filters by name via the search input', () => {
    render(<AddProviderModal onPick={vi.fn()} onClose={vi.fn()} />);
    const search = screen.getByPlaceholderText(/Search OpenRouter, Groq, Ollama/i);
    fireEvent.change(search, { target: { value: 'groq' } });
    expect(screen.getByText('Groq')).toBeInTheDocument();
    expect(screen.queryByText('OpenRouter')).not.toBeInTheDocument();
    expect(screen.queryByText('Ollama')).not.toBeInTheDocument();
  });

  it('fires onPick(catalogId) when a row is clicked', () => {
    const onPick = vi.fn();
    render(<AddProviderModal onPick={onPick} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Groq'));
    expect(onPick).toHaveBeenCalledWith('groq');
  });
});
