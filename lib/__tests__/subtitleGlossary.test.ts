import { describe, expect, it } from 'vitest';

import { mergeProperNouns } from '@/lib/subtitleGlossary';

describe('mergeProperNouns locks', () => {
  it('does not overwrite locked sources case-insensitively', () => {
    const glossary = new Map<string, string>([['Elsa', 'UserElsa']]);

    mergeProperNouns(
      glossary,
      { Elsa: 'AutoElsa', Anna: '安娜' },
      { lockedSources: new Set(['elsa']) },
    );

    expect(glossary.get('Elsa')).toBe('UserElsa');
    expect(glossary.get('Anna')).toBe('安娜');
  });

  it('does not add locked sources case-insensitively', () => {
    const glossary = new Map<string, string>();

    mergeProperNouns(
      glossary,
      { ELSA: '艾莎' },
      { lockedSources: new Set(['elsa']) },
    );

    expect(glossary.has('ELSA')).toBe(false);
  });

  it('keeps prior behavior without locks', () => {
    const glossary = new Map<string, string>([['Elsa', 'old']]);

    mergeProperNouns(glossary, { Elsa: 'new' });

    expect(glossary.get('Elsa')).toBe('new');
  });
});
