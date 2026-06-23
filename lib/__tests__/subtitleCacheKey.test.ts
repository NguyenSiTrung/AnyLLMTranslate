/**
 * Tests for the subtitle cache-key builder.
 * Keys must fold in profile/knobs + glossary + a 'subtitle:' namespace, and be
 * order-independent + deterministic.
 */
import { describe, it, expect } from 'vitest';
import {
  hashKnobs,
  hashGlossary,
  generateSubtitleCacheKey,
  type GlossarySnapshot,
} from '@/lib/subtitleCacheKey';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';

const KNOBS_A: ProfileKnobs = { register: 'neutral', faithfulness: 'literal', brevity: 'relaxed', profanity: 'preserve' };
const KNOBS_B: ProfileKnobs = { register: 'casual', faithfulness: 'idiomatic', brevity: 'moderate', profanity: 'preserve' };
const EMPTY_GLOSSARY: GlossarySnapshot = { globalEntries: [], properNouns: [] };

describe('hashKnobs', () => {
  it('is deterministic for the same knobs', () => {
    expect(hashKnobs(KNOBS_A)).toBe(hashKnobs(KNOBS_A));
  });
  it('differs for different knobs', () => {
    expect(hashKnobs(KNOBS_A)).not.toBe(hashKnobs(KNOBS_B));
  });
});

describe('hashGlossary', () => {
  it('is order-independent for globalEntries', () => {
    const a: GlossarySnapshot = { globalEntries: [{ source: 'x', target: 'y' }, { source: 'p', target: 'q' }], properNouns: [] };
    const b: GlossarySnapshot = { globalEntries: [{ source: 'p', target: 'q' }, { source: 'x', target: 'y' }], properNouns: [] };
    expect(hashGlossary(a)).toBe(hashGlossary(b));
  });
  it('is order-independent for properNouns', () => {
    const a: GlossarySnapshot = { globalEntries: [], properNouns: ['Alice', 'Bob'] };
    const b: GlossarySnapshot = { globalEntries: [], properNouns: ['Bob', 'Alice'] };
    expect(hashGlossary(a)).toBe(hashGlossary(b));
  });
  it('differs when a glossary entry is added', () => {
    const before: GlossarySnapshot = { globalEntries: [], properNouns: [] };
    const after: GlossarySnapshot = { globalEntries: [{ source: 'AI', target: ' trí tuệ nhân tạo' }], properNouns: [] };
    expect(hashGlossary(before)).not.toBe(hashGlossary(after));
  });
});

describe('generateSubtitleCacheKey', () => {
  it('is deterministic for identical inputs', async () => {
    const k1 = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    const k2 = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    expect(k1).toBe(k2);
  });

  it('differs when knobs differ (same text/langs)', async () => {
    const ka = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    const kb = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_B, EMPTY_GLOSSARY);
    expect(ka).not.toBe(kb);
  });

  it('differs when the glossary changes (same text/langs/knobs)', async () => {
    const withGlossary: GlossarySnapshot = { globalEntries: [{ source: 'AI', target: 'trí tuệ nhân tạo' }], properNouns: ['Alice'] };
    const k1 = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    const k2 = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, withGlossary);
    expect(k1).not.toBe(k2);
  });

  it('differs when text differs', async () => {
    const k1 = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    const k2 = await generateSubtitleCacheKey('World', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    expect(k1).not.toBe(k2);
  });

  it('produces a hex SHA-256 (64 hex chars)', async () => {
    const k = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
  });
});
