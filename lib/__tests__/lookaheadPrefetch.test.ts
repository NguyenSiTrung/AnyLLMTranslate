import { describe, it, expect } from 'vitest';
import { selectLookaheadCandidates, shouldRunLookahead } from '@/lib/lookaheadPrefetch';

describe('lookaheadPrefetch', () => {
  it('shouldRunLookahead skips on pause/page-off/over-threshold', () => {
    expect(
      shouldRunLookahead({ systemicPause: true, pageOff: false, activeRequests: 0 }),
    ).toBe(false);
    expect(
      shouldRunLookahead({ systemicPause: false, pageOff: true, activeRequests: 0 }),
    ).toBe(false);
    expect(
      shouldRunLookahead({
        systemicPause: false,
        pageOff: false,
        activeRequests: 2,
        activeThreshold: 1,
      }),
    ).toBe(false);
    expect(
      shouldRunLookahead({
        systemicPause: false,
        pageOff: false,
        activeRequests: 1,
        activeThreshold: 1,
      }),
    ).toBe(true);
  });

  it('selectLookaheadCandidates picks below-fold pieces, caps count, empty when none', () => {
    const ids = selectLookaheadCandidates(
      [
        { id: 'vis', isTranslated: false, inFlight: false, top: 100 },
        { id: 'margin', isTranslated: false, inFlight: false, top: 900 }, // within 800+200
        { id: 'next1', isTranslated: false, inFlight: false, top: 1200 },
        { id: 'next2', isTranslated: false, inFlight: false, top: 1400 },
        { id: 'next3', isTranslated: false, inFlight: false, top: 1600 },
        { id: 'far', isTranslated: false, inFlight: false, top: 5000 },
        { id: 'done', isTranslated: true, inFlight: false, top: 1300 },
        { id: 'busy', isTranslated: false, inFlight: true, top: 1350 },
      ],
      { viewportHeight: 800, viewportMarginPx: 200, belowPx: 900, maxPieces: 2 },
    );
    // next1/next2 are in (1000, 1700); far is outside; margin is inside IO margin
    expect(ids).toEqual(['next1', 'next2']);

    expect(
      selectLookaheadCandidates(
        [{ id: 'a', isTranslated: false, inFlight: false, top: 50 }],
        { viewportHeight: 800 },
      ),
    ).toEqual([]);
  });
});
