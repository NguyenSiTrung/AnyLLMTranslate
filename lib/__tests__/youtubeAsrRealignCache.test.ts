import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildAsrRealignCacheKey,
  canonicalizeAsrRealignInput,
  hashAsrRealignContent,
  youtubeWatchUrl,
  youtubeThumbnailUrl,
  stripYoutubeTitleSuffix,
  estimateAsrRealignEntryBytes,
  toAsrRealignSummary,
  pickLruKeysToEvict,
  sortAsrRealignSummaries,
  formatAsrRealignBytes,
  extractYoutubeVideoIdFromUrl,
  type YoutubeAsrRealignCacheEntry,
} from '@/lib/youtubeAsrRealignCache';

const units = [
  { text: 'Hello', startMs: 0, endMs: 400 },
  { text: 'world', startMs: 400, endMs: 900 },
];

describe('youtubeAsrRealignCache pure helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn(async (_algo: string, data: ArrayBuffer) => {
          const bytes = new Uint8Array(data);
          const out = new Uint8Array(32);
          for (let i = 0; i < bytes.length; i++) out[i % 32] ^= bytes[i];
          return out.buffer;
        }),
      },
    });
  });

  it('canonicalizes units stably and hashes them', async () => {
    expect(canonicalizeAsrRealignInput(units)).toBe('Hello\t0\t400\nworld\t400\t900');
    const a = await hashAsrRealignContent(units);
    const b = await hashAsrRealignContent([...units].reverse().reverse());
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    const c = await hashAsrRealignContent([{ ...units[0], text: 'Hello!' }, units[1]]);
    expect(c).not.toBe(a);
  });

  it('builds cache key and YouTube URLs', () => {
    expect(buildAsrRealignCacheKey('abc123', 'en', 'deadbeef')).toBe('ai:abc123:en:deadbeef');
    expect(youtubeWatchUrl('abc123')).toBe('https://www.youtube.com/watch?v=abc123');
    expect(youtubeThumbnailUrl('abc123')).toBe('https://i.ytimg.com/vi/abc123/mqdefault.jpg');
    expect(stripYoutubeTitleSuffix('My Video - YouTube')).toBe('My Video');
    expect(stripYoutubeTitleSuffix('Plain')).toBe('Plain');
    expect(extractYoutubeVideoIdFromUrl('https://www.youtube.com/watch?v=abc123&t=10')).toBe(
      'abc123',
    );
    expect(extractYoutubeVideoIdFromUrl('https://youtu.be/xyz789')).toBe('xyz789');
    expect(extractYoutubeVideoIdFromUrl('https://example.com')).toBeUndefined();
  });

  it('estimates bytes, maps summary, formats size, sorts, and picks LRU victims', () => {
    const entry: YoutubeAsrRealignCacheEntry = {
      key: 'ai:v:en:h',
      videoId: 'v',
      language: 'en',
      mode: 'ai',
      cueCount: 1,
      byteSize: 0,
      contentHash: 'h',
      createdAt: 10,
      lastUsedAt: 20,
      cues: [{ startTime: 0, endTime: 1, text: 'hi' }],
    };
    const bytes = estimateAsrRealignEntryBytes(entry);
    expect(bytes).toBeGreaterThan(10);
    const summary = toAsrRealignSummary({ ...entry, byteSize: bytes });
    expect(summary).not.toHaveProperty('cues');
    expect(summary.byteSize).toBe(bytes);
    expect(formatAsrRealignBytes(0)).toBe('0 B');
    expect(formatAsrRealignBytes(2048)).toMatch(/KB/);

    const sorted = sortAsrRealignSummaries(
      [
        { ...summary, key: 'a', lastUsedAt: 1, createdAt: 100 },
        { ...summary, key: 'b', lastUsedAt: 50, createdAt: 10 },
      ],
      'lastUsed',
    );
    expect(sorted.map((s) => s.key)).toEqual(['b', 'a']);

    // 2 existing + 1 incoming exceeds maxEntries=2 → evict oldest only
    // (byte budget high enough that size alone does not force a second victim)
    const victims = pickLruKeysToEvict(
      [
        { key: 'old', lastUsedAt: 1, byteSize: 100 },
        { key: 'new', lastUsedAt: 9, byteSize: 100 },
      ],
      { maxEntries: 2, maxBytes: 500, incomingBytes: 80 },
    );
    expect(victims).toEqual(['old']);
  });
});
