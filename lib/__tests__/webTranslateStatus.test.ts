import { describe, it, expect } from 'vitest';
import {
  computeTranslationStatus,
  countVisiblePending,
  collectNearViewportPieceIds,
  formatProgressLabel,
  formatProgressDetail,
  isReadingAreaReady,
} from '@/lib/webTranslateStatus';

describe('countVisiblePending', () => {
  it('counts untranslated pieces that are visible or in-flight', () => {
    const pieces = [
      { id: 'a', isTranslated: false },
      { id: 'b', isTranslated: false },
      { id: 'c', isTranslated: true },
      { id: 'd', isTranslated: false },
    ];
    const visible = new Set(['a']);
    const inFlight = new Set(['b']);
    expect(countVisiblePending(pieces, visible, inFlight)).toBe(2);
  });

  it('does not double-count a piece that is both visible and in-flight', () => {
    const pieces = [{ id: 'a', isTranslated: false }];
    expect(countVisiblePending(pieces, new Set(['a']), new Set(['a']))).toBe(1);
  });

  it('ignores translated pieces even if listed as visible', () => {
    const pieces = [{ id: 'a', isTranslated: true }];
    expect(countVisiblePending(pieces, new Set(['a']), new Set())).toBe(0);
  });
});

describe('computeTranslationStatus', () => {
  const basePieces = [
    { id: '1', isTranslated: true },
    { id: '2', isTranslated: true },
    { id: '3', isTranslated: false },
    { id: '4', isTranslated: false },
  ];

  it('returns idle when page is off', () => {
    const result = computeTranslationStatus({
      pageState: 'off',
      pieces: basePieces,
      activeRequests: 0,
      visiblePieceIds: new Set(['3']),
      inFlightPieceIds: new Set(),
    });
    expect(result.status).toBe('idle');
    expect(result.viewportComplete).toBe(true);
    expect(result.visiblePending).toBe(0);
  });

  it('returns translating when activeRequests > 0', () => {
    const result = computeTranslationStatus({
      pageState: 'dual',
      pieces: basePieces,
      activeRequests: 1,
      visiblePieceIds: new Set(),
      inFlightPieceIds: new Set(['3']),
    });
    expect(result.status).toBe('translating');
    expect(result.viewportComplete).toBe(false);
    expect(result.visiblePending).toBe(1);
    expect(result.translatedCount).toBe(2);
    expect(result.totalCount).toBe(4);
  });

  it('returns translating when near-viewport pieces remain untranslated', () => {
    const result = computeTranslationStatus({
      pageState: 'dual',
      pieces: basePieces,
      activeRequests: 0,
      visiblePieceIds: new Set(['3']),
      inFlightPieceIds: new Set(),
    });
    expect(result.status).toBe('translating');
    expect(result.visiblePending).toBe(1);
    expect(result.viewportComplete).toBe(false);
  });

  it('returns done + viewportComplete when only off-screen pieces remain', () => {
    // 3 and 4 untranslated but neither visible nor in-flight
    const result = computeTranslationStatus({
      pageState: 'dual',
      pieces: basePieces,
      activeRequests: 0,
      visiblePieceIds: new Set(),
      inFlightPieceIds: new Set(),
    });
    expect(result.status).toBe('done');
    expect(result.viewportComplete).toBe(true);
    expect(result.visiblePending).toBe(0);
    expect(result.translatedCount).toBe(2);
    expect(result.totalCount).toBe(4);
    expect(isReadingAreaReady(result)).toBe(true);
  });

  it('returns done when all pieces are translated', () => {
    const pieces = [
      { id: '1', isTranslated: true },
      { id: '2', isTranslated: true },
    ];
    const result = computeTranslationStatus({
      pageState: 'dual',
      pieces,
      activeRequests: 0,
      visiblePieceIds: new Set(),
      inFlightPieceIds: new Set(),
    });
    expect(result.status).toBe('done');
    expect(result.viewportComplete).toBe(true);
    expect(isReadingAreaReady(result)).toBe(false);
  });

  it('returns idle when page is on but no pieces extracted', () => {
    const result = computeTranslationStatus({
      pageState: 'dual',
      pieces: [],
      activeRequests: 0,
      visiblePieceIds: new Set(),
      inFlightPieceIds: new Set(),
    });
    expect(result.status).toBe('idle');
    expect(result.totalCount).toBe(0);
  });
});

describe('formatProgressLabel / formatProgressDetail', () => {
  it('shows translating label and completed fraction while active', () => {
    const result = computeTranslationStatus({
      pageState: 'dual',
      pieces: [
        { id: '1', isTranslated: true },
        { id: '2', isTranslated: false },
      ],
      activeRequests: 1,
      visiblePieceIds: new Set(['2']),
      inFlightPieceIds: new Set(['2']),
    });
    expect(formatProgressLabel(result)).toBe('Translating...');
    expect(formatProgressDetail(result)).toBe('1 of 2 completed');
  });

  it('shows reading-area-ready copy when off-screen work remains', () => {
    const result = computeTranslationStatus({
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
    expect(formatProgressLabel(result)).toBe('Reading area ready');
    expect(formatProgressDetail(result)).toBe('1 of 3 done · 2 more as you scroll');
  });

  it('shows Translation Complete when fully done', () => {
    const result = computeTranslationStatus({
      pageState: 'dual',
      pieces: [
        { id: '1', isTranslated: true },
        { id: '2', isTranslated: true },
      ],
      activeRequests: 0,
      visiblePieceIds: new Set(),
      inFlightPieceIds: new Set(),
    });
    expect(formatProgressLabel(result)).toBe('Translation Complete');
    expect(formatProgressDetail(result)).toBe('2 of 2 completed');
  });

  it('prefers error label when error is set', () => {
    const result = computeTranslationStatus({
      pageState: 'dual',
      pieces: [{ id: '1', isTranslated: false }],
      activeRequests: 0,
      visiblePieceIds: new Set(),
      inFlightPieceIds: new Set(),
    });
    expect(formatProgressLabel(result, 'Pool exhausted')).toBe('Translation Error');
  });
});

describe('collectNearViewportPieceIds', () => {
  it('includes pieces intersecting the viewport margin', () => {
    const ids = collectNearViewportPieceIds(
      [
        { id: 'in', isTranslated: false, getRect: () => ({ top: 100, bottom: 200 }) },
        { id: 'below', isTranslated: false, getRect: () => ({ top: 2000, bottom: 2100 }) },
        { id: 'done', isTranslated: true, getRect: () => ({ top: 50, bottom: 80 }) },
      ],
      { marginPx: 200, viewportHeight: 800 },
    );
    expect([...ids]).toEqual(['in']);
  });

  it('includes pieces slightly above the fold within margin', () => {
    const ids = collectNearViewportPieceIds(
      [{ id: 'above', isTranslated: false, getRect: () => ({ top: -150, bottom: -50 }) }],
      { marginPx: 200, viewportHeight: 800 },
    );
    expect(ids.has('above')).toBe(true);
  });
});
