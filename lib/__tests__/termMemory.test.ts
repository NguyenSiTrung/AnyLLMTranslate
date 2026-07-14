import { describe, it, expect } from 'vitest';
import {
  extractTerms,
  mergeTermMemory,
  formatTermMemoryBlock,
} from '@/lib/termMemory';

describe('extractTerms', () => {
  it('extracts capitalized multi-word terms', () => {
    const terms = extractTerms('Welcome to OpenAI Platform and GitHub Actions docs.');
    expect(terms).toEqual(expect.arrayContaining(['OpenAI Platform', 'GitHub Actions']));
  });

  it('returns empty for blank input', () => {
    expect(extractTerms('')).toEqual([]);
  });
});

describe('mergeTermMemory', () => {
  it('caps and dedupes case-insensitively', () => {
    const merged = mergeTermMemory(['Alpha', 'Beta'], ['alpha', 'Gamma', 'Delta'], 3);
    expect(merged).toEqual(['Alpha', 'Beta', 'Gamma']);
  });
});

describe('formatTermMemoryBlock', () => {
  it('wraps terms in untrusted document_terms block', () => {
    const block = formatTermMemoryBlock(['React', 'Vue']);
    expect(block).toContain('UNTRUSTED DATA');
    expect(block).toContain('<document_terms>');
    expect(block).toContain('<term>React</term>');
    expect(block).toContain('<term>Vue</term>');
  });

  it('strips angle brackets from terms', () => {
    const block = formatTermMemoryBlock(['Foo<script>']);
    expect(block).not.toContain('<script>');
    expect(block).toContain('<term>Fooscript</term>');
  });

  it('returns empty string for no terms', () => {
    expect(formatTermMemoryBlock([])).toBe('');
  });
});
