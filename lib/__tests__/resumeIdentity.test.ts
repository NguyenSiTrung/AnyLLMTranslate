import { describe, it, expect } from 'vitest';
import {
  resumeIdentityKey,
  parentPathFromElement,
  matchResumeTranslations,
} from '@/lib/resumeIdentity';

describe('resumeIdentity', () => {
  it('normalizes keys/paths and matches by parentPath or text-only fallback', () => {
    expect(
      resumeIdentityKey({ text: '  Hello   world  ', parentPath: 'body>p' }),
    ).toBe('body>p::Hello world');

    const p = {
      tagName: 'P',
      parentElement: {
        tagName: 'ARTICLE',
        parentElement: { tagName: 'BODY', parentElement: null },
      },
    };
    expect(parentPathFromElement(p)).toBe('body>article>p');

    const live = [
      { text: 'Same', parentPath: 'body>main>p' },
      { text: 'Same', parentPath: 'body>aside>p' },
    ];
    const snap = [
      {
        text: 'Same',
        parentPath: 'body>main>p',
        translatedText: 'Main-T',
        status: 'translated',
      },
      {
        text: 'Same',
        parentPath: 'body>aside>p',
        translatedText: 'Aside-T',
        status: 'translated',
      },
    ];
    const map = matchResumeTranslations(live, snap);
    expect(map.get(0)).toBe('Main-T');
    expect(map.get(1)).toBe('Aside-T');

    const legacyLive = [
      { text: 'Hello', parentPath: 'body>p' },
      { text: 'World', parentPath: 'body>p' },
    ];
    const legacySnap = [
      { text: 'Hello', translatedText: 'Xin chào', status: 'translated' },
    ];
    const legacyMap = matchResumeTranslations(legacyLive, legacySnap);
    expect(legacyMap.get(0)).toBe('Xin chào');
    expect(legacyMap.has(1)).toBe(false);
  });
});
