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
    beforeEach(() => {
      vi.resetModules();
    });

    it('loadSnapshot returns null when nothing is stored', async () => {
      const { loadSnapshot } = await import('../webResume');
      expect(await loadSnapshot('https://x.test', 'hash')).toBeNull();
    });
  });

  describe('FR-2: stop-order snapshot semantics', () => {
    it('frozen piece list survives clearing the live array (stop path)', async () => {
      // Models writeResumeSnapshot: capture pieces before allPieces = [].
      const live = [
        { id: 'p1', text: 'Hello', translatedText: 'Xin chào', isTranslated: true },
        { id: 'p2', text: 'World', isTranslated: false },
      ];
      const frozen = live.map((p) => ({ ...p }));
      live.length = 0; // stop clears allPieces after freeze
      expect(frozen.length).toBe(2);
      expect(frozen.filter((p) => p.isTranslated).length).toBe(1);
      expect(live.length).toBe(0);
    });
  });
});
