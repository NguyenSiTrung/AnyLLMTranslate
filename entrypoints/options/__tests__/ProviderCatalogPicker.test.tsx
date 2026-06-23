import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ProviderCatalogPicker,
  inferCatalogId,
  resolveCatalogSelection,
} from '../components/ProviderCatalogPicker';
import { getCatalogEntryById } from '@/lib/openAiCompatibleCatalog';

describe('ProviderCatalogPicker', () => {
  it('inferCatalogId matches OpenRouter base URL', () => {
    expect(inferCatalogId('https://openrouter.ai/api/v1')).toBe('openrouter');
    expect(inferCatalogId('')).toBe('custom');
  });

  it('resolveCatalogSelection preserves api key and fills base URL', () => {
    const entry = getCatalogEntryById('openrouter');
    expect(entry).toBeDefined();
    if (!entry) return;
    const sel = resolveCatalogSelection(entry, { apiKey: 'keep-me', model: '' });
    expect(sel.patch.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(sel.patch.apiKey).toBe('keep-me');
    expect(sel.patch.model).toBe('openai/gpt-4o-mini');
  });

  it('calls onSelect when catalog entry clicked', () => {
    const onSelect = vi.fn();
    render(
      <ProviderCatalogPicker
        provider={{ baseUrl: '', apiKey: '', model: '' }}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole('option', { name: /openrouter/i }));
    expect(onSelect).toHaveBeenCalled();
    expect(onSelect.mock.calls[0][0].patch.baseUrl).toContain('openrouter.ai');
  });
});