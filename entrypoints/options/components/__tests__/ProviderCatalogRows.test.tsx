// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProviderCatalogRows } from '../ProviderCatalogRows';

describe('ProviderCatalogRows', () => {
  it('filters to local category and calls onSelect', () => {
    const onSelect = vi.fn();
    const onFilterChange = vi.fn();
    render(
      <ProviderCatalogRows
        query=""
        onQueryChange={() => {}}
        filter="local"
        onFilterChange={onFilterChange}
        onSelect={onSelect}
        showFilters
      />,
    );

    expect(screen.getByRole('option', { name: /Ollama/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /OpenRouter/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^All$/i }));
    expect(onFilterChange).toHaveBeenCalledWith('all');

    fireEvent.click(screen.getByRole('option', { name: /Ollama/i }));
    expect(onSelect).toHaveBeenCalled();
    expect(onSelect.mock.calls[0][0].id).toMatch(/ollama/i);
  });
});
