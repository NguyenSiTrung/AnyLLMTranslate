import { describe, it, expect } from 'vitest';
import {
  OPENAI_COMPATIBLE_CATALOG,
  filterCatalog,
  getCatalogEntryById,
  getKeyUrlForProvider,
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

describe('getKeyUrl — catalog field', () => {
  it('keyed entries have getKeyUrl', () => {
    const keyed = OPENAI_COMPATIBLE_CATALOG.filter((e) => e.requiresApiKey);
    for (const entry of keyed) {
      expect(entry.getKeyUrl).toBeTruthy();
      expect(entry.getKeyUrl).toMatch(/^https?:\/\//);
    }
  });

  it('keyless entries (ollama, lm-studio, custom) omit getKeyUrl', () => {
    const keyless = OPENAI_COMPATIBLE_CATALOG.filter((e) => !e.requiresApiKey);
    for (const entry of keyless) {
      expect(entry.getKeyUrl).toBeUndefined();
    }
  });

  it('OpenRouter getKeyUrl is correct', () => {
    expect(getCatalogEntryById('openrouter')?.getKeyUrl).toBe('https://openrouter.ai/keys');
  });

  it('Groq getKeyUrl is correct', () => {
    expect(getCatalogEntryById('groq')?.getKeyUrl).toBe('https://console.groq.com/keys');
  });
});

describe('getKeyUrlForProvider', () => {
  it('resolves OpenRouter by base URL', () => {
    expect(getKeyUrlForProvider('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai/keys');
  });

  it('resolves Groq by base URL', () => {
    expect(getKeyUrlForProvider('https://api.groq.com/openai/v1')).toBe('https://console.groq.com/keys');
  });

  it('resolves NVIDIA NIM by base URL', () => {
    expect(getKeyUrlForProvider('https://integrate.api.nvidia.com/v1')).toBe('https://build.nvidia.com/models/api-key');
  });

  it('resolves Together AI by base URL', () => {
    expect(getKeyUrlForProvider('https://api.together.xyz/v1')).toBe('https://api.together.xyz/settings/api-keys');
  });

  it('resolves Fireworks AI by base URL', () => {
    expect(getKeyUrlForProvider('https://api.fireworks.ai/inference/v1')).toBe('https://fireworks.ai/api-keys');
  });

  it('resolves Mistral AI by base URL', () => {
    expect(getKeyUrlForProvider('https://api.mistral.ai/v1')).toBe('https://console.mistral.ai/api-keys/');
  });

  it('returns undefined for keyless providers (Ollama)', () => {
    expect(getKeyUrlForProvider('http://localhost:11434/v1')).toBeUndefined();
  });

  it('returns undefined for unknown base URLs', () => {
    expect(getKeyUrlForProvider('https://api.unknown.com/v1')).toBeUndefined();
  });

  it('returns undefined for empty base URL', () => {
    expect(getKeyUrlForProvider('')).toBeUndefined();
    expect(getKeyUrlForProvider('   ')).toBeUndefined();
  });

  it('handles trailing slash in base URL', () => {
    expect(getKeyUrlForProvider('https://openrouter.ai/api/v1/')).toBe('https://openrouter.ai/keys');
  });
});