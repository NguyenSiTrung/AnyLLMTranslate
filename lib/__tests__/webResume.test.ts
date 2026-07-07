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

describe('webResume', () => {
  describe('computeResumeKey', () => {
    it('produces a stable key for the same url + contentHash', () => {
      const a = computeResumeKey('https://x.test/page', 'abc123');
      const b = computeResumeKey('https://x.test/page', 'abc123');
      expect(a).toBe(a);
      expect(b).toBe(a);
    });

    it('produces different keys for different urls or content hashes', () => {
      const base = computeResumeKey('https://x.test/page', 'abc123');
      expect(computeResumeKey('https://x.test/other', 'abc123')).not.toBe(base);
      expect(computeResumeKey('https://x.test/page', 'different')).not.toBe(base);
    });

    it('uses the webResume namespace prefix', () => {
      expect(computeResumeKey('https://x.test', 'h')).toMatch(/^webResume:/);
    });
  });

  describe('serializeSnapshot / deserializeSnapshot', () => {
    it('round-trips a snapshot with translated pieces', () => {
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
      const serialized = serializeSnapshot(snapshot);
      expect(typeof serialized).toBe('string');
      const back = deserializeSnapshot(serialized);
      expect(back).toEqual(snapshot);
    });

    it('deserializeSnapshot returns null for malformed input', () => {
      expect(deserializeSnapshot('not json')).toBeNull();
      expect(deserializeSnapshot('')).toBeNull();
    });

    it('deserializeSnapshot returns null for an object missing required fields', () => {
      expect(deserializeSnapshot(JSON.stringify({ url: 'x' }))).toBeNull();
    });
  });

  describe('isSnapshotFresh', () => {
    it('returns true for a recent snapshot', () => {
      const now = Date.now();
      const snapshot: WebResumeSnapshot = {
        url: 'x',
        contentHash: 'h',
        targetLanguage: 'vi',
        capturedAt: now,
        pieces: [],
      };
      expect(isSnapshotFresh(snapshot, now)).toBe(true);
    });

    it('returns false for a snapshot older than RESUME_TTL_DAYS', () => {
      const now = Date.now();
      const stale = now - (RESUME_TTL_DAYS + 1) * 24 * 60 * 60 * 1000;
      const snapshot: WebResumeSnapshot = {
        url: 'x',
        contentHash: 'h',
        targetLanguage: 'vi',
        capturedAt: stale,
        pieces: [],
      };
      expect(isSnapshotFresh(snapshot, now)).toBe(false);
    });
  });

  describe('constants', () => {
    it('exposes a 7-day TTL and a 50-URL LRU cap', () => {
      expect(RESUME_TTL_DAYS).toBe(7);
      expect(MAX_RESUME_URLS).toBe(50);
    });
  });

  describe('storage integration (saveSnapshot / loadSnapshot / evictResume)', () => {
    // idb-keyval needs IndexedDB, which jsdom lacks. Spy on the idb-keyval-backed
    // store helpers indirectly via the public API by mocking the store module.
    beforeEach(() => {
      vi.resetModules();
    });

    it('loadSnapshot returns null when nothing is stored', async () => {
      const { loadSnapshot } = await import('../webResume');
      const result = await loadSnapshot('https://x.test', 'hash');
      expect(result).toBeNull();
    });
  });
});
