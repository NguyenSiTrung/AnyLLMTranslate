import { describe, it, expect } from 'vitest';
import {
  resumeIdentityKey,
  parentPathFromElement,
  matchResumeTranslations,
} from '@/lib/resumeIdentity';

describe('resumeIdentityKey', () => {
  it('normalizes whitespace in text', () => {
    expect(
      resumeIdentityKey({ text: '  Hello   world  ', parentPath: 'body>p' }),
    ).toBe('body>p::Hello world');
  });
});

describe('parentPathFromElement', () => {
  it('builds a tag chain', () => {
    const p = {
      tagName: 'P',
      parentElement: {
        tagName: 'ARTICLE',
        parentElement: { tagName: 'BODY', parentElement: null },
      },
    };
    expect(parentPathFromElement(p)).toBe('body>article>p');
  });
});

describe('matchResumeTranslations', () => {
  it('matches duplicate texts by parent path when available', () => {
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
  });

  it('falls back to text-only for legacy snapshots without parentPath', () => {
    const live = [
      { text: 'Hello', parentPath: 'body>p' },
      { text: 'World', parentPath: 'body>p' },
    ];
    const snap = [
      { text: 'Hello', translatedText: 'Xin chào', status: 'translated' },
    ];
    const map = matchResumeTranslations(live, snap);
    expect(map.get(0)).toBe('Xin chào');
    expect(map.has(1)).toBe(false);
  });
});
