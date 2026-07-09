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
  it('computeResumeKey is stable, namespaced, and hash/url sensitive', () => {
    const a = computeResumeKey('https://x.test/page', 'abc123');
    expect(a).toBe(computeResumeKey('https://x.test/page', 'abc123'));
    expect(a).toMatch(/^webResume:/);
    expect(computeResumeKey('https://x.test/other', 'abc123')).not.toBe(a);
    expect(computeResumeKey('https://x.test/page', 'different')).not.toBe(a);
  });

  it('serialize/deserialize round-trips and rejects malformed input', () => {
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
  });

  it('isSnapshotFresh respects RESUME_TTL_DAYS; constants are stable', () => {
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
    beforeEach(() => {
      vi.resetModules();
    });

    it('loadSnapshot returns null when nothing is stored', async () => {
      const { loadSnapshot } = await import('../webResume');
      expect(await loadSnapshot('https://x.test', 'hash')).toBeNull();
    });
  });
});
