/**
 * Viewport Observer — lazy translation using IntersectionObserver.
 * Only translates content as it enters the viewport + 200px margin.
 */

import type { TranslationPiece } from '@/types/translation';
import { VIEWPORT_MARGIN } from '@/lib/constants';

export type OnVisibleCallback = (pieces: TranslationPiece[]) => void;

export class ViewportObserver {
  private observer: IntersectionObserver;
  private pieceMap: Map<Element, TranslationPiece[]> = new Map();
  private pendingPieces: TranslationPiece[] = [];
  /** Piece ids already handed to onVisible — never re-queue until release/disconnect. */
  private dispatchedIds = new Set<string>();
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private onVisible: OnVisibleCallback;
  private batchDelayMs: number;
  /** When true, intersecting pieces stay observed but are not dispatched (pool pause). */
  private paused = false;

  constructor(onVisible: OnVisibleCallback, batchDelayMs = 100) {
    this.onVisible = onVisible;
    this.batchDelayMs = batchDelayMs;

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const pieces = this.pieceMap.get(entry.target);
          if (!pieces) continue;

          // Systemic pause (e.g. provider pool exhausted): keep observing so
          // when pause clears we can re-dispatch, but do not fire API work while
          // the user scrolls through the rest of the page.
          if (this.paused) {
            continue;
          }

          const untranslated = pieces.filter(
            (piece) => !piece.isTranslated && !this.dispatchedIds.has(piece.id),
          );
          if (untranslated.length === 0) {
            this.observer.unobserve(entry.target);
            this.pieceMap.delete(entry.target);
            continue;
          }

          for (const piece of untranslated) {
            this.dispatchedIds.add(piece.id);
          }
          this.pendingPieces.push(...untranslated);
          this.observer.unobserve(entry.target);
          this.pieceMap.delete(entry.target);
        }

        if (this.pendingPieces.length > 0) {
          this.scheduleBatch();
        }
      },
      { rootMargin: VIEWPORT_MARGIN },
    );
  }

  /** Pause dispatching (intersecting elements stay tracked for later). */
  setPaused(paused: boolean): void {
    const wasPaused = this.paused;
    this.paused = paused;
    // When resuming, re-check currently tracked targets that may already be visible.
    if (wasPaused && !paused) {
      this.redispatchVisible();
    }
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /**
   * Allow a piece to be dispatched again (user retry after failure, or after a
   * systemic pause is cleared for pieces that never completed).
   */
  release(pieceId: string): void {
    this.dispatchedIds.delete(pieceId);
  }

  releaseAll(pieceIds: Iterable<string>): void {
    for (const id of pieceIds) {
      this.dispatchedIds.delete(id);
    }
  }

  /** Observe a translation piece */
  observe(piece: TranslationPiece): void {
    if (piece.isTranslated) return;
    // Already handed off to translatePieces — do not re-observe until release.
    if (this.dispatchedIds.has(piece.id)) return;

    const target = piece.parentElement;
    const existing = this.pieceMap.get(target);
    if (existing) {
      if (!existing.includes(piece)) {
        existing.push(piece);
      }
      return;
    }

    this.pieceMap.set(target, [piece]);
    this.observer.observe(target);
  }

  /** Observe multiple pieces */
  observeAll(pieces: TranslationPiece[]): void {
    for (const piece of pieces) {
      this.observe(piece);
    }
  }

  /** Stop observing all elements */
  disconnect(): void {
    this.observer.disconnect();
    this.pieceMap.clear();
    this.pendingPieces = [];
    this.dispatchedIds.clear();
    this.paused = false;
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /** Get count of observed elements */
  get observedCount(): number {
    return this.pieceMap.size;
  }

  private scheduleBatch(): void {
    if (this.batchTimer) return;
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      this.flushPending();
    }, this.batchDelayMs);
  }

  private flushPending(): void {
    if (this.pendingPieces.length === 0) return;

    // Dedupe by id and drop anything that finished while we were debouncing
    // (resume snapshot, concurrent batch, same-lang skip, etc.).
    const seen = new Set<string>();
    const batch: TranslationPiece[] = [];
    for (const piece of this.pendingPieces) {
      if (piece.isTranslated) continue;
      if (seen.has(piece.id)) continue;
      seen.add(piece.id);
      batch.push(piece);
    }
    this.pendingPieces = [];
    if (batch.length === 0) return;
    this.onVisible(batch);
  }

  /**
   * After unpausing, targets still in pieceMap that are on-screen never re-fire
   * IntersectionObserver (no threshold cross). Manually queue untranslated ones.
   */
  private redispatchVisible(): void {
    const toDispatch: TranslationPiece[] = [];
    for (const [target, pieces] of [...this.pieceMap.entries()]) {
      const rect = target.getBoundingClientRect();
      const margin = 200; // keep in sync with VIEWPORT_MARGIN roughly
      const visible =
        rect.bottom >= -margin &&
        rect.top <= (typeof window !== 'undefined' ? window.innerHeight : 0) + margin;
      if (!visible) continue;

      const untranslated = pieces.filter(
        (piece) => !piece.isTranslated && !this.dispatchedIds.has(piece.id),
      );
      if (untranslated.length === 0) continue;

      for (const piece of untranslated) {
        this.dispatchedIds.add(piece.id);
      }
      toDispatch.push(...untranslated);
      this.observer.unobserve(target);
      this.pieceMap.delete(target);
    }
    if (toDispatch.length > 0) {
      this.pendingPieces.push(...toDispatch);
      this.scheduleBatch();
    }
  }
}
