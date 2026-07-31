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
    expect(ids).toContain('opencode-zen');
    expect(ids).toContain('deepseek');
    expect(getCatalogEntryById('openrouter')?.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(getCatalogEntryById('openrouter')?.requiresApiKey).toBe(true);
    expect(getCatalogEntryById('google-ai-studio')?.baseUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai',
    );
    expect(getCatalogEntryById('google-ai-studio')?.requiresApiKey).toBe(true);
    expect(getCatalogEntryById('google-ai-studio')?.getKeyUrl).toBe(
      'https://aistudio.google.com/apikey',
    );
    expect(getCatalogEntryById('opencode-zen')?.baseUrl).toBe('https://opencode.ai/zen/v1');
    expect(getCatalogEntryById('opencode-zen')?.requiresApiKey).toBe(true);
    expect(getCatalogEntryById('opencode-zen')?.getKeyUrl).toBe('https://opencode.ai/auth');
    expect(getCatalogEntryById('opencode-zen')?.defaultModel).toBe('deepseek-v4-flash-free');
    expect(getCatalogEntryById('deepseek')?.baseUrl).toBe('https://api.deepseek.com');
    expect(getCatalogEntryById('deepseek')?.requiresApiKey).toBe(true);
    expect(getCatalogEntryById('deepseek')?.getKeyUrl).toBe(
      'https://platform.deepseek.com/api_keys',
    );
    expect(getCatalogEntryById('deepseek')?.defaultModel).toBe('deepseek-v4-flash');
    expect(filterCatalog('gemini').some((e) => e.id === 'google-ai-studio')).toBe(true);
    expect(filterCatalog('opencode').some((e) => e.id === 'opencode-zen')).toBe(true);
    expect(filterCatalog('deepseek').some((e) => e.id === 'deepseek')).toBe(true);
    expect(getKeyUrlForProvider('https://generativelanguage.googleapis.com/v1beta/openai')).toBe(
      'https://aistudio.google.com/apikey',
    );
    expect(getKeyUrlForProvider('https://opencode.ai/zen/v1')).toBe('https://opencode.ai/auth');
    expect(getKeyUrlForProvider('https://api.deepseek.com')).toBe(
      'https://platform.deepseek.com/api_keys',
    );
    expect(inferCatalogId('https://generativelanguage.googleapis.com/v1beta/openai/')).toBe(
      'google-ai-studio',
    );
    expect(inferCatalogId('https://opencode.ai/zen/v1/')).toBe('opencode-zen');
    expect(inferCatalogId('https://api.deepseek.com/')).toBe('deepseek');

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
