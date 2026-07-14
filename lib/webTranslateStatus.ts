/**
 * Pure helpers for viewport-aware web translation progress (FR-1).
 * Content script builds inputs; popup formats copy — no DOM required for status math.
 */

import type { TabTranslationStatus } from '@/types/messages';

/** Minimal piece shape for status computation (avoids DOM in unit tests). */
export interface StatusPieceInput {
  id: string;
  isTranslated: boolean;
}

export interface ComputeStatusInput {
  /** Current page display state; `'off'` means not translating. */
  pageState: string;
  pieces: StatusPieceInput[];
  /** In-flight LLM batch count (content script `activeRequests`). */
  activeRequests: number;
  /** Untranslated piece ids currently near the reading viewport. */
  visiblePieceIds: ReadonlySet<string>;
  /** Piece ids currently mid-translation (in-flight). */
  inFlightPieceIds: ReadonlySet<string>;
}

export interface ComputeStatusResult {
  status: TabTranslationStatus;
  translatedCount: number;
  totalCount: number;
  /** Untranslated pieces in the reading strip or currently in-flight. */
  visiblePending: number;
  /**
   * True when nothing is actively pending in the reading strip
   * (no in-flight work and no near-viewport untranslated pieces).
   */
  viewportComplete: boolean;
}

/**
 * Count untranslated pieces that are either near the viewport or in-flight.
 * In-flight pieces stay "visible pending" even after IntersectionObserver unobserves them.
 */
export function countVisiblePending(
  pieces: StatusPieceInput[],
  visiblePieceIds: ReadonlySet<string>,
  inFlightPieceIds: ReadonlySet<string>,
): number {
  let count = 0;
  for (const piece of pieces) {
    if (piece.isTranslated) continue;
    if (inFlightPieceIds.has(piece.id) || visiblePieceIds.has(piece.id)) {
      count++;
    }
  }
  return count;
}

/**
 * Compute popup-facing translation status.
 *
 * - Never reports whole-page "complete" while untranslated pieces remain off-screen
 *   without distinguishing that case via `viewportComplete` + counts.
 * - `status === 'done'` with `translatedCount < totalCount` means the reading area
 *   is idle; remaining work appears as the user scrolls.
 * - `status === 'translating'` only when active requests or near-viewport pending work.
 */
export function computeTranslationStatus(input: ComputeStatusInput): ComputeStatusResult {
  const { pageState, pieces, activeRequests, visiblePieceIds, inFlightPieceIds } = input;
  const translatedCount = pieces.filter((p) => p.isTranslated).length;
  const totalCount = pieces.length;
  const visiblePending = countVisiblePending(pieces, visiblePieceIds, inFlightPieceIds);
  const viewportComplete = visiblePending === 0 && activeRequests === 0;

  if (pageState === 'off') {
    return {
      status: 'idle',
      translatedCount,
      totalCount,
      visiblePending: 0,
      viewportComplete: true,
    };
  }

  if (activeRequests > 0 || visiblePending > 0) {
    return {
      status: 'translating',
      translatedCount,
      totalCount,
      visiblePending,
      viewportComplete: false,
    };
  }

  if (totalCount === 0) {
    return {
      status: 'idle',
      translatedCount: 0,
      totalCount: 0,
      visiblePending: 0,
      viewportComplete: true,
    };
  }

  // Viewport idle: full-page done OR more remaining as user scrolls.
  return {
    status: 'done',
    translatedCount,
    totalCount,
    visiblePending: 0,
    viewportComplete: true,
  };
}

/** Whether the reading strip is idle but off-screen pieces remain. */
export function isReadingAreaReady(result: ComputeStatusResult): boolean {
  return (
    result.viewportComplete &&
    result.totalCount > 0 &&
    result.translatedCount < result.totalCount &&
    result.status === 'done'
  );
}

/** Popup status card title. */
export function formatProgressLabel(
  result: Pick<ComputeStatusResult, 'status' | 'translatedCount' | 'totalCount' | 'viewportComplete'>,
  error?: string,
): string {
  if (error) return 'Translation Error';
  if (result.status === 'translating') return 'Translating...';
  if (result.status === 'idle') return 'Ready to Translate';
  if (isReadingAreaReady(result as ComputeStatusResult)) return 'Reading area ready';
  if (result.status === 'done') return 'Translation Complete';
  return 'Ready to Translate';
}

/** Popup progress detail line under the title. */
export function formatProgressDetail(
  result: Pick<
    ComputeStatusResult,
    'status' | 'translatedCount' | 'totalCount' | 'viewportComplete' | 'visiblePending'
  >,
): string {
  const { translatedCount, totalCount } = result;
  const remaining = totalCount - translatedCount;

  if (isReadingAreaReady(result as ComputeStatusResult)) {
    return `${translatedCount} of ${totalCount} done · ${remaining} more as you scroll`;
  }

  return `${translatedCount} of ${totalCount} completed`;
}

/**
 * Collect piece ids whose parent is near the viewport (margin matches VIEWPORT_MARGIN ~200px).
 * Injectable geometry for unit tests.
 */
export function collectNearViewportPieceIds(
  pieces: Array<{ id: string; isTranslated: boolean; getRect: () => { top: number; bottom: number } }>,
  options?: { marginPx?: number; viewportHeight?: number },
): Set<string> {
  const marginPx = options?.marginPx ?? 200;
  const viewportHeight = options?.viewportHeight ?? 800;
  const ids = new Set<string>();

  for (const piece of pieces) {
    if (piece.isTranslated) continue;
    const rect = piece.getRect();
    const near =
      rect.bottom >= -marginPx && rect.top <= viewportHeight + marginPx;
    if (near) ids.add(piece.id);
  }

  return ids;
}
