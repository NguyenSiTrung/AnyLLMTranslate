/**
 * Pure helpers for look-ahead prefetch candidate selection (FR-8).
 * Band membership comes from the ViewportObserver's IntersectionObserver state
 * (FR-15), so selection never reads layout.
 */

export interface LookaheadPieceInput {
  id: string;
  isTranslated: boolean;
  inFlight: boolean;
  /** Below the dispatch margin but inside the look-ahead band. */
  inLookaheadBand: boolean;
}

export interface LookaheadOptions {
  /** Max candidates to return (default 4). */
  maxPieces?: number;
}

/** Select untranslated, idle look-ahead-band pieces in document order. */
export function selectLookaheadCandidates(
  pieces: LookaheadPieceInput[],
  options: LookaheadOptions,
): string[] {
  const max = options.maxPieces ?? 4;
  const ids: string[] = [];
  for (const piece of pieces) {
    if (piece.isTranslated || piece.inFlight || !piece.inLookaheadBand) continue;
    ids.push(piece.id);
    if (ids.length >= max) break;
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
