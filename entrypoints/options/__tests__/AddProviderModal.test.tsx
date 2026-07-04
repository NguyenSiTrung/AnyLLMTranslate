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

  it('lists all 6 cloud providers + 2 local + 1 custom', () => {
    render(<AddProviderModal onPick={vi.fn()} onClose={vi.fn()} />);
    // Cloud
    expect(screen.getByText('OpenRouter')).toBeInTheDocument();
    expect(screen.getByText('NVIDIA NIM')).toBeInTheDocument();
    expect(screen.getByText('Groq')).toBeInTheDocument();
    expect(screen.getByText('Together AI')).toBeInTheDocument();
    expect(screen.getByText('Fireworks AI')).toBeInTheDocument();
    expect(screen.getByText('Mistral AI')).toBeInTheDocument();
    // Local
    expect(screen.getByText('Ollama')).toBeInTheDocument();
    expect(screen.getByText('LM Studio')).toBeInTheDocument();
    // Custom
    expect(screen.getByText('Custom endpoint')).toBeInTheDocument();
  });

  it('filters by name via the search input', () => {
    render(<AddProviderModal onPick={vi.fn()} onClose={vi.fn()} />);
    const search = screen.getByPlaceholderText(/Search OpenRouter, Groq, Ollama/i);
    fireEvent.change(search, { target: { value: 'groq' } });
    expect(screen.getByText('Groq')).toBeInTheDocument();
    expect(screen.queryByText('OpenRouter')).not.toBeInTheDocument();
    expect(screen.queryByText('Ollama')).not.toBeInTheDocument();
  });

  it('filters by keyword (e.g. "local" matches Ollama + LM Studio)', () => {
    render(<AddProviderModal onPick={vi.fn()} onClose={vi.fn()} />);
    const search = screen.getByPlaceholderText(/Search OpenRouter, Groq, Ollama/i);
    fireEvent.change(search, { target: { value: 'local' } });
    expect(screen.getByText('Ollama')).toBeInTheDocument();
    expect(screen.getByText('LM Studio')).toBeInTheDocument();
    expect(screen.queryByText('OpenRouter')).not.toBeInTheDocument();
  });

  it('shows an empty-state message when nothing matches', () => {
    render(<AddProviderModal onPick={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: 'zzzzz' } });
    expect(screen.getByText(/no providers match/i)).toBeInTheDocument();
  });

  it('fires onPick(catalogId) when a row is clicked', () => {
    const onPick = vi.fn();
    render(<AddProviderModal onPick={onPick} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Groq'));
    expect(onPick).toHaveBeenCalledWith('groq');
  });

  it('renders an identity badge with the right monogram per row (Groq → GQ)', () => {
    render(<AddProviderModal onPick={vi.fn()} onClose={vi.fn()} />);
    const badge = screen.getByText('GQ');
    expect(badge).toHaveClass('bg-orange-600/15');
    expect(badge).toHaveClass('text-orange-400');
  });

  it('renders the gear monogram for the Custom row', () => {
    render(<AddProviderModal onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('⚙')).toBeInTheDocument();
  });

  it('uses Done/Cancel buttons (no dual Close)', () => {
    render(<AddProviderModal onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Close' })).toHaveLength(0);
  });

  it('hides the Local group when the search only matches cloud providers', () => {
    render(<AddProviderModal onPick={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: 'groq' } });
    expect(screen.queryByText('Local')).not.toBeInTheDocument();
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
  });
});
