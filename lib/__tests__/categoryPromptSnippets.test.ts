import { describe, it, expect } from 'vitest';
import {
  getCategoryPromptSnippet,
  formatCategorySnippetBlock,
  normalizeCategoryKey,
} from '@/lib/categoryPromptSnippets';

describe('categoryPromptSnippets', () => {
  it('resolves known categories', () => {
    expect(getCategoryPromptSnippet('Documentation')).toMatch(/technical/i);
    expect(getCategoryPromptSnippet('news')).toMatch(/journalistic/i);
  });

  it('returns null for unknown', () => {
    expect(getCategoryPromptSnippet('totally-unknown-xyz')).toBeNull();
  });

  it('formats untrusted category + static rules', () => {
    const block = formatCategorySnippetBlock('documentation');
    expect(block).toContain('<page_category>documentation</page_category>');
    expect(block).toContain('<category_rules>');
    expect(block).toContain('UNTRUSTED DATA');
  });

  it('normalizeCategoryKey lowercases', () => {
    expect(normalizeCategoryKey('  News  ')).toBe('news');
  });
});
