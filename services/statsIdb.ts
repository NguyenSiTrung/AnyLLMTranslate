/**
 * Stats v2 daily dimensional records backed by IndexedDB via idb-keyval.
 * Key = YYYY-MM-DD date string on DailyStatRecord.date.
 */

import { createStore, get, set, del, entries, clear } from 'idb-keyval';
import type { DailyStatRecord } from '@/types/stats';
import { STORAGE_KEYS } from '@/lib/constants';

/** Stats store — lazy initialized */
let store: ReturnType<typeof createStore> | null = null;

function getStore(): ReturnType<typeof createStore> {
  if (!store) {
    store = createStore(STORAGE_KEYS.STATS_DB, STORAGE_KEYS.STATS_STORE);
  }
  return store;
}

/** Get a single daily record by date key, or undefined if missing. */
export async function getDailyRecord(
  date: string,
): Promise<DailyStatRecord | undefined> {
  return get<DailyStatRecord>(date, getStore());
}

/** Upsert a daily record (key = record.date). */
export async function setDailyRecord(record: DailyStatRecord): Promise<void> {
  await set(record.date, record, getStore());
}

/** Return all daily records currently in the store. */
export async function getAllDailyRecords(): Promise<DailyStatRecord[]> {
  const all = await entries<string, DailyStatRecord>(getStore());
  return all.map(([, record]) => record);
}

/**
 * Delete daily records with date strictly before cutoffDateInclusive.
 * Uses string compare on YYYY-MM-DD keys. Returns number of deleted records.
 */
export async function deleteDailyRecordsBefore(
  cutoffDateInclusive: string,
): Promise<number> {
  const all = await entries<string, DailyStatRecord>(getStore());
  let deleted = 0;
  for (const [key] of all) {
    if (key < cutoffDateInclusive) {
      await del(key, getStore());
      deleted += 1;
    }
  }
  return deleted;
}

/** Clear every daily record from the stats store. */
export async function clearAllDailyRecords(): Promise<void> {
  await clear(getStore());
}
