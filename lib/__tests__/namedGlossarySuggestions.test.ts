import { describe, expect, it } from 'vitest';
import type { NamedGlossaryList } from '@/types/config';
import { buildSuggestionRows, mergeSuggestionMaps } from '@/lib/namedGlossarySuggestions';

const activeList: NamedGlossaryList = {
  id: 'characters',
  name: 'Characters',
  entries: [{ id: '1', source: 'Alice', target: '爱丽丝' }],
  updatedAt: 1,
};

describe('mergeSuggestionMaps', () => {
  it('does not wipe existing entries when incoming is empty', () => {
    expect(mergeSuggestionMaps({ Elsa: '艾莎' }, {})).toEqual({ Elsa: '艾莎' });
    expect(mergeSuggestionMaps({ Elsa: '艾莎' }, { '': 'x', Bob: '' })).toEqual({ Elsa: '艾莎' });
  });

  it('accumulates new names and overwrites same-source targets', () => {
    expect(
      mergeSuggestionMaps({ Elsa: '艾莎' }, { Anna: '安娜', Elsa: '艾尔莎' }),
    ).toEqual({ Elsa: '艾尔莎', Anna: '安娜' });
  });

  it('prefers existing keys when capping', () => {
    const existing = { A: '1', B: '2' };
    const incoming = { C: '3', D: '4' };
    expect(mergeSuggestionMaps(existing, incoming, 3)).toEqual({ A: '1', B: '2', C: '3' });
  });
});

describe('buildSuggestionRows', () => {
  it('excludes sources already in the active list case-insensitively', () => {
    expect(buildSuggestionRows({ ALICE: '艾丽斯', Bob: '鲍勃' }, activeList)).toEqual([
      { source: 'Bob', target: '鲍勃' },
    ]);
  });

  it('sorts by source stably without mutating the input record order', () => {
    const auto = { zoe: '佐伊', Amy: '艾米', amy: '阿米' };

    expect(buildSuggestionRows(auto, undefined)).toEqual([
      { source: 'Amy', target: '艾米' },
      { source: 'amy', target: '阿米' },
      { source: 'zoe', target: '佐伊' },
    ]);
    expect(Object.keys(auto)).toEqual(['zoe', 'Amy', 'amy']);
  });

  it('caps rows at the requested limit and defaults to 30', () => {
    const auto = Object.fromEntries(
      Array.from({ length: 35 }, (_, index) => [`Name${String(index).padStart(2, '0')}`, `${index}`]),
    );

    expect(buildSuggestionRows(auto, undefined)).toHaveLength(30);
    expect(buildSuggestionRows(auto, undefined, 2)).toEqual([
      { source: 'Name00', target: '0' },
      { source: 'Name01', target: '1' },
    ]);
  });
});
