import { describe, it, expect } from 'vitest';
import {
  computeTranslationStatus,
  countVisiblePending,
  collectNearViewportPieceIds,
  formatProgressLabel,
  formatProgressDetail,
  isReadingAreaReady,
} from '@/lib/webTranslateStatus';

describe('webTranslateStatus', () => {
  const basePieces = [
    { id: '1', isTranslated: true },
    { id: '2', isTranslated: true },
    { id: '3', isTranslated: false },
    { id: '4', isTranslated: false },
  ];

  it('countVisiblePending unions visible and in-flight without double-counting', () => {
    const pieces = [
      { id: 'a', isTranslated: false },
      { id: 'b', isTranslated: false },
      { id: 'c', isTranslated: true },
      { id: 'd', isTranslated: false },
    ];
    expect(countVisiblePending(pieces, new Set(['a']), new Set(['b']))).toBe(2);
    expect(countVisiblePending([{ id: 'a', isTranslated: false }], new Set(['a']), new Set(['a']))).toBe(
      1,
    );
    expect(countVisiblePending([{ id: 'a', isTranslated: true }], new Set(['a']), new Set())).toBe(0);
  });

  it('computeTranslationStatus covers idle / translating / done states', () => {
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
