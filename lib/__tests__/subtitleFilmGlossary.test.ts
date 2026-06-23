/**
 * Tests for per-film proper-noun glossary canonicalization + content hash.
 * Sub-project 3 of the subtitle-optimization effort.
 */
import { describe, it, expect } from 'vitest';
import { canonicalizeCueCorpus, contentHash } from '@/lib/subtitleFilmGlossary';
import type { SubtitleCue } from '@/types/subtitle';

const cue = (text: string, voice?: string): SubtitleCue => ({
  startTime: 0,
  endTime: 1,
  text,
  voice,
});

describe('canonicalizeCueCorpus', () => {
  it('order-independent: same cues in different order → same string', () => {
    const a = canonicalizeCueCorpus([cue('Hello'), cue('World')]);
    const b = canonicalizeCueCorpus([cue('World'), cue('Hello')]);
    expect(a).toBe(b);
  });

  it('lowercases and trims whitespace', () => {
    expect(canonicalizeCueCorpus([cue('  HeLLo  ')])).toBe(
      canonicalizeCueCorpus([cue('hello')]),
    );
  });

  it('strips [Speaker] voice prefixes', () => {
    // voice prefix is a display concern, not content identity — same text with
    // and without a speaker tag must canonicalize identically.
    const withVoice = canonicalizeCueCorpus([cue('I am here', 'Alice')]);
    const noVoice = canonicalizeCueCorpus([cue('I am here')]);
    expect(withVoice).toBe(noVoice);
  });

  it('dedupes identical texts', () => {
    const once = canonicalizeCueCorpus([cue('Hi')]);
    const thrice = canonicalizeCueCorpus([cue('Hi'), cue('Hi'), cue('Hi')]);
    expect(once).toBe(thrice);
  });

  it('empty cue set → empty canonical string', () => {
    expect(canonicalizeCueCorpus([])).toBe('');
  });

  it('whitespace-only texts are trimmed to empty and deduped', () => {
    expect(canonicalizeCueCorpus([cue('   '), cue('')])).toBe('');
  });
});

describe('contentHash', () => {
  it('is deterministic: same input → same hash', async () => {
    const a = await contentHash([cue('Hello'), cue('World')]);
    const b = await contentHash([cue('World'), cue('Hello')]);
    expect(a).toBe(b);
  });

  it('different corpora → different hashes', async () => {
    const a = await contentHash([cue('Hello')]);
    const b = await contentHash([cue('Goodbye')]);
    expect(a).not.toBe(b);
  });

  it('returns a hex string (64 chars for SHA-256)', async () => {
    const hash = await contentHash([cue('Hello')]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('empty cue set still hashes (no throw)', async () => {
    const hash = await contentHash([]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
