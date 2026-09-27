import { describe, expect, it } from 'vitest';
import { formatFrozenGlossary } from '@/lib/subtitleGlossary';

describe('formatFrozenGlossary', () => {
  it('returns an empty string for an empty set', () => {
    expect(formatFrozenGlossary({})).toBe('');
  });

  it('formats one line per pair with the frozen copy', () => {
    expect(formatFrozenGlossary({ Alice: 'A-lít', Rabbit: 'Con thỏ' })).toBe(
      'Frozen terminology for this track (use these consistently):\n- "Alice" → "A-lít"\n- "Rabbit" → "Con thỏ"',
    );
  });

  it('skips blank sources and targets', () => {
    expect(formatFrozenGlossary({ ' ': 'x', Alice: '' })).toBe('');
  });
});
