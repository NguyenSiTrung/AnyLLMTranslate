/**
 * Web resume must live in extension-origin IDB (background), not page-origin
 * content-script IDB — otherwise CLEAR_CACHE cannot wipe it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage } from '../background';
import type { WebResumeSnapshot } from '@/lib/webResume';

const idbStores = new Map<string, Map<string, unknown>>();

function storeMap(store?: { name?: string }): Map<string, unknown> {
  const name = store?.name ?? '__default__';
  let m = idbStores.get(name);
  if (!m) {
    m = new Map();
    idbStores.set(name, m);
  }
  return m;
}

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
  tabs: { sendMessage: vi.fn(), onRemoved: { addListener: vi.fn() } },
  alarms: {
    create: vi.fn(),
    get: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

vi.mock('idb-keyval', () => ({
  createStore: vi.fn((dbName: string, storeName: string) => ({
    name: `${dbName}::${storeName}`,
  })),
  get: vi.fn(async (key: string, store?: { name?: string }) => storeMap(store).get(key)),
  set: vi.fn(async (key: string, value: unknown, store?: { name?: string }) => {
    storeMap(store).set(key, value);
  }),
  del: vi.fn(async (key: string, store?: { name?: string }) => {
    storeMap(store).delete(key);
  }),
  entries: vi.fn(async (store?: { name?: string }) => [...storeMap(store).entries()]),
  clear: vi.fn(async (store?: { name?: string }) => {
    storeMap(store).clear();
  }),
}));

describe('background web resume + CLEAR_CACHE', () => {
  beforeEach(() => {
    for (const m of idbStores.values()) m.clear();
  });

  it('SAVE → LOAD round-trips, CLEAR_CACHE removes snapshot', async () => {
    const snapshot: WebResumeSnapshot = {
      url: 'https://example.test/article',
      contentHash: 'hash-abc',
      targetLanguage: 'vi',
      capturedAt: Date.now(),
      pieces: [
        {
          id: 'p1',
          text: 'Hello world',
          translatedText: 'Xin chào thế giới',
          status: 'translated',
        },
      ],
    };

    const saveRes = await handleMessage(
      { action: 'WEB_RESUME_SAVE', snapshot },
      {} as chrome.runtime.MessageSender,
    );
    expect(saveRes).toEqual({ success: true });

    const loadRes = (await handleMessage(
      {
        action: 'WEB_RESUME_LOAD',
        url: snapshot.url,
        contentHash: snapshot.contentHash,
      },
      {} as chrome.runtime.MessageSender,
    )) as { success: boolean; snapshot: WebResumeSnapshot | null };
    expect(loadRes.success).toBe(true);
    expect(loadRes.snapshot?.pieces[0]?.translatedText).toBe('Xin chào thế giới');

    const clearRes = await handleMessage(
      { action: 'CLEAR_CACHE' },
      {} as chrome.runtime.MessageSender,
    );
    expect(clearRes).toEqual({ success: true });

    const loadAfter = (await handleMessage(
      {
        action: 'WEB_RESUME_LOAD',
        url: snapshot.url,
        contentHash: snapshot.contentHash,
      },
      {} as chrome.runtime.MessageSender,
    )) as { success: boolean; snapshot: WebResumeSnapshot | null };
    expect(loadAfter.snapshot).toBeNull();
  });
});
