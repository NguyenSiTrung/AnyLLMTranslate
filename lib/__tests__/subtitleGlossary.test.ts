import { describe, expect, it } from 'vitest';

import { mergeProperNouns } from '@/lib/subtitleGlossary';

describe('mergeProperNouns locks', () => {
  it('never overwrites/adds locked sources case-insensitively; keeps prior behavior without locks', () => {
    const glossary = new Map<string, string>([['Elsa', 'UserElsa']]);

    mergeProperNouns(
      glossary,
      { Elsa: 'AutoElsa', Anna: '安娜' },
      { lockedSources: new Set(['elsa']) },
    );

    expect(glossary.get('Elsa')).toBe('UserElsa');
    expect(glossary.get('Anna')).toBe('安娜');

    const emptyGlossary = new Map<string, string>();

    mergeProperNouns(
      emptyGlossary,
      { ELSA: '艾莎' },
      { lockedSources: new Set(['elsa']) },
    );

    expect(emptyGlossary.has('ELSA')).toBe(false);

    const unlocked = new Map<string, string>([['Elsa', 'old']]);

    mergeProperNouns(unlocked, { Elsa: 'new' });

    expect(unlocked.get('Elsa')).toBe('new');
  });
});
