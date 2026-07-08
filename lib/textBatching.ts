/**
 * Request-boundary batching helpers for web-page translation (FR-2).
 *
 * Splits a flush of translation pieces into LLM request-sized sub-batches so a
 * single large viewport flush never becomes one oversized request, and dedups
 * identical short paragraphs that scrolled in together. Mirrors Immersive
 * Translate's `maxTextGroupLengthPerRequest` / `maxTextLengthPerRequest`.
 */

export interface BatchOptions {
  /** Max number of pieces per request (0 = unlimited). Mirrors Immersive's default of 4. */
  maxTextGroupLengthPerRequest: number;
  /** Max cumulative characters per request (0 = unlimited). Default 2000. */
  maxTextLengthPerRequest: number;
}

/** A minimal piece shape these helpers operate on. */
export interface BatchablePiece {
  id: string;
  text: string;
  /** FR-3: true when the piece is inside an article/main container. Preserved
   *  through dedup + split so the background can partition batches by context. */
  inArticleContext?: boolean;
}

/**
 * Split pieces into sub-batches respecting both a per-request piece count cap
 * and a per-request cumulative character cap. A single piece that alone exceeds
 * the char cap is never dropped — it becomes its own singleton batch (so no
 * content is silently lost). `0` budgets mean unlimited.
 */
export function splitPiecesIntoBatches(
  pieces: BatchablePiece[],
  options: BatchOptions,
): BatchablePiece[][] {
  const { maxTextGroupLengthPerRequest: maxCount, maxTextLengthPerRequest: maxChars } = options;
  if (pieces.length === 0) return [];

  // Both budgets unlimited → single batch.
  if ((!maxCount || maxCount <= 0) && (!maxChars || maxChars <= 0)) {
    return [pieces.slice()];
  }

  const batches: BatchablePiece[][] = [];
  let current: BatchablePiece[] = [];
  let currentChars = 0;

  const flush = (): void => {
    if (current.length > 0) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
  };

  for (const piece of pieces) {
    const pieceChars = piece.text.length;
    const countWouldExceed = maxCount > 0 && current.length >= maxCount;
    // Adding this piece would overflow the char budget AND the batch is non-empty.
    // (An oversized single piece still emits when current is empty.)
    const charsWouldExceed =
      maxChars > 0 && currentChars + pieceChars > maxChars && current.length > 0;

    if (countWouldExceed || charsWouldExceed) {
      flush();
    }
    current.push(piece);
    currentChars += pieceChars;
  }
  flush();
  return batches;
}

export interface DedupResult {
  /** Pieces with duplicate texts removed (first occurrence kept). */
  deduped: BatchablePiece[];
  /** Maps a removed piece's id → the canonical piece id whose translation to copy. */
  dupes: Map<string, string>;
}

/**
 * Remove pieces with identical text within a single flush, returning a map from
 * each duplicate id to the canonical id it should adopt once translated. Keeps
 * the first occurrence's id as canonical.
 */
export function dedupPiecesByText(pieces: BatchablePiece[]): DedupResult {
  const deduped: BatchablePiece[] = [];
  const dupes = new Map<string, string>();
  const textToId = new Map<string, string>();
  for (const piece of pieces) {
    const canonical = textToId.get(piece.text);
    if (canonical !== undefined) {
      dupes.set(piece.id, canonical);
    } else {
      textToId.set(piece.text, piece.id);
      deduped.push(piece);
    }
  }
  return { deduped, dupes };
}
