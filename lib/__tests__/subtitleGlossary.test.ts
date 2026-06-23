import { describe, it, expect } from 'vitest';
import {
  mergeProperNouns,
  formatRollingGlossary,
  MAX_ROLLING_GLOSSARY,
} from '@/lib/subtitleGlossary';

describe('mergeProperNouns', () => {
  it('adds new entries to the map', () => {
    const map = new Map<string, string>();
    mergeProperNouns(map, { John: 'Juan', MIT: 'MIT' });
    expect(map.get('John')).toBe('Juan');
    expect(map.get('MIT')).toBe('MIT');
    expect(map.size).toBe(2);
  });

  it('overwrites existing entries with new translations', () => {
    const map = new Map<string, string>([['John', 'Jon']]);
    mergeProperNouns(map, { John: 'Juan' });
    expect(map.get('John')).toBe('Juan');
  });

  it('ignores empty values in properNouns', () => {
    const map = new Map<string, string>();
    mergeProperNouns(map, { John: '', MIT: 'MIT' });
    expect(map.size).toBe(1);
    expect(map.get('MIT')).toBe('MIT');
  });

  it('stops adding when the map reaches MAX_ROLLING_GLOSSARY', () => {
    const map = new Map<string, string>();
    // Fill to the cap
    for (let i = 0; i < MAX_ROLLING_GLOSSARY; i++) {
      map.set(`k${i}`, `v${i}`);
    }
    mergeProperNouns(map, { NewKey: 'NewVal' });
    expect(map.size).toBe(MAX_ROLLING_GLOSSARY);
    expect(map.get('NewKey')).toBeUndefined();
  });
});

describe('formatRollingGlossary', () => {
  it('returns empty string for an empty map', () => {
    expect(formatRollingGlossary(new Map())).toBe('');
  });

  it('formats entries as a prompt section', () => {
    const map = new Map<string, string>([
      ['John', 'Juan'],
      ['MIT', 'MIT'],
    ]);
    const result = formatRollingGlossary(map);
    expect(result).toContain('Previously translated names in this content');
    expect(result).toContain('"John" → "Juan"');
    expect(result).toContain('"MIT" → "MIT"');
  });
});
