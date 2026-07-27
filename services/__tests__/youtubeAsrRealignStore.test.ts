import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  get: vi.fn(async (key: string) => memory.get(key)),
  set: vi.fn(async (key: string, val: unknown) => {
    memory.set(key, val);
  }),
  del: vi.fn(async (key: string) => {
    memory.delete(key);
  }),
  entries: vi.fn(async () => [...memory.entries()]),
  clear: vi.fn(async () => {
    memory.clear();
  }),
}));

import {
  getAsrRealignEntry,
  saveAsrRealignEntry,
  listAsrRealignSummaries,
  deleteAsrRealignEntry,
  clearAsrRealignCache,
  getAsrRealignCacheStats,
  touchAsrRealignEntry,
  getOrCreateAsrRealignInflight,
} from '../youtubeAsrRealignStore';
import type { YoutubeAsrRealignCacheEntry } from '@/lib/youtubeAsrRealignCache';

function makeEntry(over: Partial<YoutubeAsrRealignCacheEntry> = {}): YoutubeAsrRealignCacheEntry {
  return {
    key: 'ai:vid:en:hash1',
    videoId: 'vid',
    language: 'en',
    mode: 'ai',
    title: 'Sample',
    thumbnailUrl: 'https://i.ytimg.com/vi/vid/mqdefault.jpg',
    youtubeUrl: 'https://www.youtube.com/watch?v=vid',
    cueCount: 1,
    byteSize: 0,
    contentHash: 'hash1',
    createdAt: 1000,
    lastUsedAt: 1000,
    cues: [{ startTime: 0, endTime: 1, text: 'hello' }],
    ...over,
  };
}

describe('youtubeAsrRealignStore', () => {
  beforeEach(() => {
    memory.clear();
    vi.clearAllMocks();
  });

  it('saves, gets, lists summaries without cues, touches, deletes, clears, stats', async () => {
    await saveAsrRealignEntry(makeEntry());
    const got = await getAsrRealignEntry('ai:vid:en:hash1');
    expect(got?.cues[0]?.text).toBe('hello');
    expect(got?.byteSize).toBeGreaterThan(0);

    const list = await listAsrRealignSummaries();
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('cues');

    const before = got!.lastUsedAt;
    await new Promise((r) => setTimeout(r, 5));
    await touchAsrRealignEntry('ai:vid:en:hash1');
    const touched = await getAsrRealignEntry('ai:vid:en:hash1');
    expect(touched!.lastUsedAt).toBeGreaterThanOrEqual(before);

    const stats = await getAsrRealignCacheStats();
    expect(stats.entryCount).toBe(1);
    expect(stats.totalBytes).toBeGreaterThan(0);

    await deleteAsrRealignEntry('ai:vid:en:hash1');
    expect(await getAsrRealignEntry('ai:vid:en:hash1')).toBeUndefined();

    await saveAsrRealignEntry(makeEntry());
    await clearAsrRealignCache();
    expect(await getAsrRealignCacheStats()).toEqual({ entryCount: 0, totalBytes: 0 });
  });

  it('coalesces inflight factories per key', async () => {
    let calls = 0;
    const p1 = getOrCreateAsrRealignInflight('k', async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return 'ok';
    });
    const p2 = getOrCreateAsrRealignInflight('k', async () => {
      calls++;
      return 'other';
    });
    await expect(Promise.all([p1, p2])).resolves.toEqual(['ok', 'ok']);
    expect(calls).toBe(1);
  });

  it('never throws when idb fails', async () => {
    const { get } = await import('idb-keyval');
    vi.mocked(get).mockRejectedValueOnce(new Error('idb down'));
    await expect(getAsrRealignEntry('x')).resolves.toBeUndefined();
  });

  it('evicts oldest lastUsed when over max entries', async () => {
    for (let i = 0; i < 51; i++) {
      await saveAsrRealignEntry(
        makeEntry({
          key: `ai:v${i}:en:h${i}`,
          videoId: `v${i}`,
          contentHash: `h${i}`,
          lastUsedAt: i + 1,
          createdAt: i + 1,
        }),
      );
    }
    expect(memory.size).toBe(50);
    expect(memory.has('ai:v0:en:h0')).toBe(false);
    expect(memory.has('ai:v50:en:h50')).toBe(true);
  });
});
