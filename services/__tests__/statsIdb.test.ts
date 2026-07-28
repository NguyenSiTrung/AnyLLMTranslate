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

  it('CRUD lifecycle: round-trips records, lists all days, deletes before cutoff, and clears the store', async () => {
    // Round-trip + list all stored days.
    const day = emptyDay('2026-07-01');
    day.totals.characters = 42;
    await setDailyRecord(day);
    await expect(getDailyRecord('2026-07-01')).resolves.toEqual(day);

    const a = emptyDay('2026-06-01');
    const b = emptyDay('2026-07-01');
    b.totals.characters = 42;
    await setDailyRecord(a);
    await setDailyRecord(b);
    const all = await getAllDailyRecords();
    expect(all).toHaveLength(2);
    expect(all).toEqual(expect.arrayContaining([a, b]));

    // Delete before cutoff + clear-all empties the store.
    const n = await deleteDailyRecordsBefore('2026-06-15');
    expect(n).toBe(1);
    await expect(getDailyRecord('2026-06-01')).resolves.toBeUndefined();
    await expect(getDailyRecord('2026-07-01')).resolves.toBeDefined();

    await clearAllDailyRecords();
    await expect(getDailyRecord('2026-07-01')).resolves.toBeUndefined();
  });
});
