import { describe, it, expect } from 'vitest';
import {
  OPENAI_COMPATIBLE_CATALOG,
  filterCatalog,
  getCatalogEntryById,
  getKeyUrlForProvider,
  groupByCategory,
  inferCatalogId,
  resolveProviderIdentity,
} from '@/lib/openAiCompatibleCatalog';

describe('openAiCompatibleCatalog', () => {
  it('lists/filters providers, resolves key URLs, identity fallbacks, and category groups', () => {
    const ids = OPENAI_COMPATIBLE_CATALOG.map((e) => e.id);
    expect(ids).toContain('openrouter');
    expect(ids).toContain('ollama');
    expect(ids).toContain('groq');
    expect(ids).toContain('google-ai-studio');
    expect(getCatalogEntryById('openrouter')?.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(getCatalogEntryById('openrouter')?.requiresApiKey).toBe(true);
    expect(getCatalogEntryById('google-ai-studio')?.baseUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai',
    );
    expect(getCatalogEntryById('google-ai-studio')?.requiresApiKey).toBe(true);
    expect(getCatalogEntryById('google-ai-studio')?.getKeyUrl).toBe(
      'https://aistudio.google.com/apikey',
    );
    expect(filterCatalog('gemini').some((e) => e.id === 'google-ai-studio')).toBe(true);
    expect(getKeyUrlForProvider('https://generativelanguage.googleapis.com/v1beta/openai')).toBe(
      'https://aistudio.google.com/apikey',
    );
    expect(inferCatalogId('https://generativelanguage.googleapis.com/v1beta/openai/')).toBe(
      'google-ai-studio',
    );

    expect(filterCatalog('')).toHaveLength(OPENAI_COMPATIBLE_CATALOG.length);
    expect(filterCatalog('router').some((e) => e.id === 'openrouter')).toBe(true);
    expect(filterCatalog('GROQ')).toHaveLength(1);

    expect(getKeyUrlForProvider('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai/keys');
    expect(getKeyUrlForProvider('https://openrouter.ai/api/v1/')).toBe('https://openrouter.ai/keys');
    expect(getKeyUrlForProvider('http://localhost:11434/v1')).toBeUndefined();
    expect(getKeyUrlForProvider('')).toBeUndefined();

    // Identity fallback chain and category grouping
    expect(resolveProviderIdentity('Whatever', 'groq', 'https://example.com').monogram).toBe('GQ');
    expect(
      resolveProviderIdentity('Whatever', 'custom', 'https://api.groq.com/openai/v1').monogram,
    ).toBe('⚙');
    expect(
      resolveProviderIdentity('Whatever', undefined, 'http://localhost:11434/v1').monogram,
    ).toBe('OL');
    expect(
      resolveProviderIdentity('My Provider', undefined, 'https://api.unknown.com/v1').monogram,
    ).toBe('M');
    expect(resolveProviderIdentity('  ', undefined, '').monogram).toBe('?');

    expect(inferCatalogId('')).toBe('custom');
    expect(inferCatalogId('https://openrouter.ai/api/v1/')).toBe('openrouter');
    expect(inferCatalogId('https://api.unknown.com/v1')).toBe('custom');

    const groups = groupByCategory();
    expect(groups.map((g) => g.category)).toEqual(['cloud', 'local', 'custom']);
    expect(groups.find((g) => g.category === 'local')?.entries.map((e) => e.id)).toEqual([
      'ollama',
      'lm-studio',
    ]);
    const filtered = groupByCategory(filterCatalog('ollama'));
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.category).toBe('local');
  });
});
