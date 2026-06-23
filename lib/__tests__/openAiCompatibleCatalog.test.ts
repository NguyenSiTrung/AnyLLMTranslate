import { describe, it, expect } from 'vitest';
import {
  OPENAI_COMPATIBLE_CATALOG,
  filterCatalog,
  getCatalogEntryById,
} from '@/lib/openAiCompatibleCatalog';

describe('openAiCompatibleCatalog', () => {
  it('includes required provider entries', () => {
    const ids = OPENAI_COMPATIBLE_CATALOG.map((e) => e.id);
    expect(ids).toContain('openrouter');
    expect(ids).toContain('ollama');
    expect(ids).toContain('groq');
  });

  it('filterCatalog returns all when query is empty', () => {
    expect(filterCatalog('')).toHaveLength(OPENAI_COMPATIBLE_CATALOG.length);
    expect(filterCatalog('   ')).toHaveLength(OPENAI_COMPATIBLE_CATALOG.length);
  });

  it('filterCatalog matches OpenRouter by name and keyword', () => {
    expect(filterCatalog('openrouter').some((e) => e.id === 'openrouter')).toBe(true);
    expect(filterCatalog('router').some((e) => e.id === 'openrouter')).toBe(true);
  });

  it('filterCatalog is case-insensitive', () => {
    const results = filterCatalog('GROQ');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('groq');
  });

  it('getCatalogEntryById returns entry with baseUrl', () => {
    const entry = getCatalogEntryById('openrouter');
    expect(entry?.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(entry?.requiresApiKey).toBe(true);
  });
});