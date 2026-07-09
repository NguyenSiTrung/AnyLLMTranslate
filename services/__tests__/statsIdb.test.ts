import { describe, it, expect, vi, beforeEach } from 'vitest';

const memory = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  get: vi.fn(async (key: string) => memory.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    memory.set(key, value);
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
  getDailyRecord,
  setDailyRecord,
  getAllDailyRecords,
  clearAllDailyRecords,
  deleteDailyRecordsBefore,
} from '../statsIdb';
import { ZERO_COUNTERS, type DailyStatRecord } from '@/types/stats';

function emptyDay(date: string): DailyStatRecord {
  return {
    date,
    totals: { ...ZERO_COUNTERS },
    byMode: {},
    byProvider: {},
    byHost: {},
    byLanguagePair: {},
  };
}

describe('statsIdb', () => {
  beforeEach(() => {
    memory.clear();
    vi.clearAllMocks();
  });

  it('round-trips a daily record', async () => {
    const day = emptyDay('2026-07-01');
    day.totals.characters = 42;
    await setDailyRecord(day);
    await expect(getDailyRecord('2026-07-01')).resolves.toEqual(day);
  });

  it('deletes records before cutoff', async () => {
    await setDailyRecord(emptyDay('2026-06-01'));
    await setDailyRecord(emptyDay('2026-07-01'));
    const n = await deleteDailyRecordsBefore('2026-06-15');
    expect(n).toBe(1);
    await expect(getDailyRecord('2026-06-01')).resolves.toBeUndefined();
    await expect(getDailyRecord('2026-07-01')).resolves.toBeDefined();
  });

  it('clearAllDailyRecords empties store', async () => {
    await setDailyRecord(emptyDay('2026-07-01'));
    await clearAllDailyRecords();
    await expect(getDailyRecord('2026-07-01')).resolves.toBeUndefined();
  });

  it('getAllDailyRecords returns all stored days', async () => {
    const a = emptyDay('2026-06-01');
    const b = emptyDay('2026-07-01');
    await setDailyRecord(a);
    await setDailyRecord(b);
    const all = await getAllDailyRecords();
    expect(all).toHaveLength(2);
    expect(all).toEqual(expect.arrayContaining([a, b]));
  });
});
