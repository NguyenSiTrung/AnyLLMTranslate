/**
 * Pure helpers for look-ahead prefetch candidate selection (FR-8).
 * Content script supplies piece geometry; this keeps policy unit-testable.
 */

export interface LookaheadPieceInput {
  id: string;
  isTranslated: boolean;
  inFlight: boolean;
  /** getBoundingClientRect().top */
  top: number;
}

export interface LookaheadOptions {
  viewportHeight: number;
  /** Already covered by IntersectionObserver (default 200). */
  viewportMarginPx?: number;
  /** How far below the fold to prefetch (default 900). */
  belowPx?: number;
  /** Max candidates to return (default 4). */
  maxPieces?: number;
  /** Skip when active request count is above this (caller checks separately). */
}

/**
 * Select untranslated pieces just below the fold for low-priority prefetch.
 * Does not include pieces already in the IO margin (those are normal priority).
 */
export function selectLookaheadCandidates(
  pieces: LookaheadPieceInput[],
  options: LookaheadOptions,
): string[] {
  const margin = options.viewportMarginPx ?? 200;
  const below = options.belowPx ?? 900;
  const max = options.maxPieces ?? 4;
  const vh = options.viewportHeight;

  const ids: string[] = [];
  for (const piece of pieces) {
    if (piece.isTranslated || piece.inFlight) continue;
    if (piece.top > vh + margin && piece.top < vh + below) {
      ids.push(piece.id);
      if (ids.length >= max) break;
    }
  }
  return ids;
}

/** Whether look-ahead should run given load + pause state. */
export function shouldRunLookahead(opts: {
  systemicPause: boolean;
  pageOff: boolean;
  activeRequests: number;
  activeThreshold?: number;
}): boolean {
  if (opts.systemicPause || opts.pageOff) return false;
  const threshold = opts.activeThreshold ?? 1;
  return opts.activeRequests <= threshold;
}
