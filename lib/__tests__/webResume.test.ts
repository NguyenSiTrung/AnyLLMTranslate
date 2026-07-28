/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeResumeKey,
  serializeSnapshot,
  deserializeSnapshot,
  isSnapshotFresh,
  MAX_RESUME_URLS,
  RESUME_TTL_DAYS,
  type WebResumeSnapshot,
} from '../webResume';

/** In-memory idb-keyval stand-in so save/load/clear exercise real store logic. */
const idbStores = new Map<string, Map<string, unknown>>();

function storeMap(dbName: string, storeName: string): Map<string, unknown> {
  const name = `${dbName}::${storeName}`;
  let m = idbStores.get(name);
  if (!m) {
    m = new Map();
    idbStores.set(name, m);
  }
  return m;
}

vi.mock('idb-keyval', () => ({
  createStore: vi.fn((dbName: string, storeName: string) => ({ dbName, storeName })),
  get: vi.fn(async (key: string, store: { dbName: string; storeName: string }) => {
    return storeMap(store.dbName, store.storeName).get(key);
  }),
  set: vi.fn(async (key: string, value: unknown, store: { dbName: string; storeName: string }) => {
    storeMap(store.dbName, store.storeName).set(key, value);
  }),
  del: vi.fn(async (key: string, store: { dbName: string; storeName: string }) => {
    storeMap(store.dbName, store.storeName).delete(key);
  }),
  entries: vi.fn(async (store: { dbName: string; storeName: string }) => {
    return Array.from(storeMap(store.dbName, store.storeName).entries());
  }),
  clear: vi.fn(async (store: { dbName: string; storeName: string }) => {
    storeMap(store.dbName, store.storeName).clear();
  }),
}));

describe('webResume', () => {
  beforeEach(() => {
    idbStores.clear();
    vi.clearAllMocks();
  });

  it('key stability, serialize round-trip, freshness/TTL constants', () => {
    const a = computeResumeKey('https://x.test/page', 'abc123');
    expect(a).toBe(computeResumeKey('https://x.test/page', 'abc123'));
    expect(a).toMatch(/^webResume:/);
    expect(computeResumeKey('https://x.test/other', 'abc123')).not.toBe(a);
    expect(computeResumeKey('https://x.test/page', 'different')).not.toBe(a);

    const snapshot: WebResumeSnapshot = {
      url: 'https://x.test/page',
      contentHash: 'abc123',
      targetLanguage: 'vi',
      capturedAt: 1700000000000,
      pieces: [
        { id: 'p1', text: 'Hello', translatedText: 'Xin chào', status: 'translated' },
        { id: 'p2', text: 'World', status: 'pending' },
      ],
    };
    expect(deserializeSnapshot(serializeSnapshot(snapshot))).toEqual(snapshot);
    expect(deserializeSnapshot('not json')).toBeNull();
    expect(deserializeSnapshot(JSON.stringify({ url: 'x' }))).toBeNull();

    const now = Date.now();
    expect(
      isSnapshotFresh(
        { url: 'x', contentHash: 'h', targetLanguage: 'vi', capturedAt: now, pieces: [] },
        now,
      ),
    ).toBe(true);
    const stale = now - (RESUME_TTL_DAYS + 1) * 24 * 60 * 60 * 1000;
    expect(
      isSnapshotFresh(
        { url: 'x', contentHash: 'h', targetLanguage: 'vi', capturedAt: stale, pieces: [] },
        now,
      ),
    ).toBe(false);
    expect(RESUME_TTL_DAYS).toBe(7);
    expect(MAX_RESUME_URLS).toBe(50);
  });

  describe('storage integration', () => {
    it('loadSnapshot returns null when empty; clearAllResumeSnapshots removes saved snapshots', async () => {
      const {
        saveSnapshot,
        loadSnapshot,
        clearAllResumeSnapshots,
      } = await import('../webResume');

      expect(await loadSnapshot('https://x.test', 'hash')).toBeNull();

      const snapshot: WebResumeSnapshot = {
        url: 'https://x.test/page',
        contentHash: 'abc123',
        targetLanguage: 'vi',
        capturedAt: Date.now(),
        pieces: [
          { id: 'p1', text: 'Hello', translatedText: 'Xin chào', status: 'translated' },
        ],
      };
      await saveSnapshot(snapshot);
      expect(await loadSnapshot(snapshot.url, snapshot.contentHash)).not.toBeNull();

      await clearAllResumeSnapshots();
      expect(await loadSnapshot(snapshot.url, snapshot.contentHash)).toBeNull();
    });
  });
});
