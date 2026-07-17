import { describe, it, expect } from 'vitest';
import {
  getCategoryPromptSnippet,
  formatCategorySnippetBlock,
  normalizeCategoryKey,
} from '@/lib/categoryPromptSnippets';

describe('categoryPromptSnippets', () => {
  it('resolves known categories, null unknown, formats block, normalizes keys', () => {
    expect(getCategoryPromptSnippet('Documentation')).toMatch(/technical/i);
    expect(getCategoryPromptSnippet('news')).toMatch(/journalistic/i);
    expect(getCategoryPromptSnippet('totally-unknown-xyz')).toBeNull();

    const block = formatCategorySnippetBlock('documentation');
    expect(block).toContain('<page_category>documentation</page_category>');
    expect(block).toContain('<category_rules>');
    expect(block).toContain('UNTRUSTED DATA');

    expect(normalizeCategoryKey('  News  ')).toBe('news');
  });
});
