import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeResumeKey,
  serializeSnapshot,
  deserializeSnapshot,
  isSnapshotFresh,
  MAX_RESUME_URLS,
  RESUME_TTL_DAYS,
  type WebResumeSnapshot,
} from '../webResume';
import {
  resumeIdentityKey,
  parentPathFromElement,
  matchResumeTranslations,
} from '@/lib/resumeIdentity';
import {
  computeTranslationStatus,
  countVisiblePending,
  collectNearViewportPieceIds,
  formatProgressLabel,
  formatProgressDetail,
  isReadingAreaReady,
} from '@/lib/webTranslateStatus';

/**
 * @vitest-environment jsdom
 */

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

  it('key stability, serialize round-trip, freshness/TTL constants, and save/load/clear storage integration', async () => {
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

    const {
      saveSnapshot,
      loadSnapshot,
      clearAllResumeSnapshots,
    } = await import('../webResume');

    expect(await loadSnapshot('https://x.test', 'hash')).toBeNull();

    const stored: WebResumeSnapshot = {
      url: 'https://x.test/page',
      contentHash: 'abc123',
      targetLanguage: 'vi',
      capturedAt: Date.now(),
      pieces: [
        { id: 'p1', text: 'Hello', translatedText: 'Xin chào', status: 'translated' },
      ],
    };
    await saveSnapshot(stored);
    expect(await loadSnapshot(stored.url, stored.contentHash)).not.toBeNull();

    await clearAllResumeSnapshots();
    expect(await loadSnapshot(stored.url, stored.contentHash)).toBeNull();
  });
});

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

describe('webTranslateStatus', () => {
  const basePieces = [
    { id: '1', isTranslated: true },
    { id: '2', isTranslated: true },
    { id: '3', isTranslated: false },
    { id: '4', isTranslated: false },
  ];

  it('computeTranslationStatus covers idle / translating / done states; countVisiblePending unions without double-counting', () => {
    const pendingPieces = [
      { id: 'a', isTranslated: false },
      { id: 'b', isTranslated: false },
      { id: 'c', isTranslated: true },
      { id: 'd', isTranslated: false },
    ];
    expect(countVisiblePending(pendingPieces, new Set(['a']), new Set(['b']))).toBe(2);
    expect(countVisiblePending([{ id: 'a', isTranslated: false }], new Set(['a']), new Set(['a']))).toBe(
      1,
    );
    expect(countVisiblePending([{ id: 'a', isTranslated: true }], new Set(['a']), new Set())).toBe(0);

    expect(
      computeTranslationStatus({
        pageState: 'off',
        pieces: basePieces,
        activeRequests: 0,
        visiblePieceIds: new Set(['3']),
        inFlightPieceIds: new Set(),
      }),
    ).toMatchObject({ status: 'idle', viewportComplete: true, visiblePending: 0 });

    const translating = computeTranslationStatus({
      pageState: 'dual',
      pieces: basePieces,
      activeRequests: 1,
      visiblePieceIds: new Set(),
      inFlightPieceIds: new Set(['3']),
    });
    expect(translating).toMatchObject({
      status: 'translating',
      viewportComplete: false,
      visiblePending: 1,
      translatedCount: 2,
      totalCount: 4,
    });

    expect(
      computeTranslationStatus({
        pageState: 'dual',
        pieces: basePieces,
        activeRequests: 0,
        visiblePieceIds: new Set(['3']),
        inFlightPieceIds: new Set(),
      }).status,
    ).toBe('translating');

    const offScreen = computeTranslationStatus({
      pageState: 'dual',
      pieces: basePieces,
      activeRequests: 0,
      visiblePieceIds: new Set(),
      inFlightPieceIds: new Set(),
    });
    expect(offScreen).toMatchObject({
      status: 'done',
      viewportComplete: true,
      visiblePending: 0,
      translatedCount: 2,
      totalCount: 4,
    });
    expect(isReadingAreaReady(offScreen)).toBe(true);

    const allDone = computeTranslationStatus({
      pageState: 'dual',
      pieces: [
        { id: '1', isTranslated: true },
        { id: '2', isTranslated: true },
      ],
      activeRequests: 0,
      visiblePieceIds: new Set(),
      inFlightPieceIds: new Set(),
    });
    expect(allDone.status).toBe('done');
    expect(isReadingAreaReady(allDone)).toBe(false);

    expect(
      computeTranslationStatus({
        pageState: 'dual',
        pieces: [],
        activeRequests: 0,
        visiblePieceIds: new Set(),
        inFlightPieceIds: new Set(),
      }),
    ).toMatchObject({ status: 'idle', totalCount: 0 });
  });

  it('formatProgressLabel/Detail for active, reading-area-ready, complete, and error', () => {
    const active = computeTranslationStatus({
      pageState: 'dual',
      pieces: [
        { id: '1', isTranslated: true },
        { id: '2', isTranslated: false },
      ],
      activeRequests: 1,
      visiblePieceIds: new Set(['2']),
      inFlightPieceIds: new Set(['2']),
    });
    expect(formatProgressLabel(active)).toBe('Translating...');
    expect(formatProgressDetail(active)).toBe('1 of 2 completed');

    const ready = computeTranslationStatus({
      pageState: 'dual',
      pieces: [
        { id: '1', isTranslated: true },
        { id: '2', isTranslated: false },
        { id: '3', isTranslated: false },
      ],
      activeRequests: 0,
      visiblePieceIds: new Set(),
      inFlightPieceIds: new Set(),
    });
    expect(formatProgressLabel(ready)).toBe('Reading area ready');
    expect(formatProgressDetail(ready)).toBe('1 of 3 done · 2 more as you scroll');

    const done = computeTranslationStatus({
      pageState: 'dual',
      pieces: [
        { id: '1', isTranslated: true },
        { id: '2', isTranslated: true },
      ],
      activeRequests: 0,
      visiblePieceIds: new Set(),
      inFlightPieceIds: new Set(),
    });
    expect(formatProgressLabel(done)).toBe('Translation Complete');
    expect(formatProgressDetail(done)).toBe('2 of 2 completed');

    const err = computeTranslationStatus({
      pageState: 'dual',
      pieces: [{ id: '1', isTranslated: false }],
      activeRequests: 0,
      visiblePieceIds: new Set(),
      inFlightPieceIds: new Set(),
    });
    expect(formatProgressLabel(err, 'Pool exhausted')).toBe('Translation Error');
  });

  it('collectNearViewportPieceIds includes margin and excludes translated/far pieces', () => {
    expect([
      ...collectNearViewportPieceIds(
        [
          { id: 'in', isTranslated: false, getRect: () => ({ top: 100, bottom: 200 }) },
          { id: 'below', isTranslated: false, getRect: () => ({ top: 2000, bottom: 2100 }) },
          { id: 'done', isTranslated: true, getRect: () => ({ top: 50, bottom: 80 }) },
        ],
        { marginPx: 200, viewportHeight: 800 },
      ),
    ]).toEqual(['in']);

    expect(
      collectNearViewportPieceIds(
        [{ id: 'above', isTranslated: false, getRect: () => ({ top: -150, bottom: -50 }) }],
        { marginPx: 200, viewportHeight: 800 },
      ).has('above'),
    ).toBe(true);
  });
});
