import { describe, it, expect } from 'vitest';
import {
  extractTerms,
  mergeTermMemory,
  formatTermMemoryBlock,
} from '@/lib/termMemory';

describe('termMemory', () => {
  it('extracts, merges, and formats document terms safely', () => {
    expect(extractTerms('Welcome to OpenAI Platform and GitHub Actions docs.')).toEqual(
      expect.arrayContaining(['OpenAI Platform', 'GitHub Actions']),
    );
    expect(extractTerms('')).toEqual([]);

    expect(mergeTermMemory(['Alpha', 'Beta'], ['alpha', 'Gamma', 'Delta'], 3)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);

    const block = formatTermMemoryBlock(['React', 'Vue']);
    expect(block).toContain('UNTRUSTED DATA');
    expect(block).toContain('<document_terms>');
    expect(block).toContain('<term>React</term>');
    expect(block).toContain('<term>Vue</term>');

    const stripped = formatTermMemoryBlock(['Foo<script>']);
    expect(stripped).not.toContain('<script>');
    expect(stripped).toContain('<term>Fooscript</term>');
    expect(formatTermMemoryBlock([])).toBe('');
  });
});
