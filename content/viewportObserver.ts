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
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private onVisible: OnVisibleCallback;
  private batchDelayMs: number;

  constructor(onVisible: OnVisibleCallback, batchDelayMs = 100) {
    this.onVisible = onVisible;
    this.batchDelayMs = batchDelayMs;

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pieces = this.pieceMap.get(entry.target);
            if (pieces) {
              const untranslated = pieces.filter((piece) => !piece.isTranslated);
              this.pendingPieces.push(...untranslated);
              this.observer.unobserve(entry.target);
              this.pieceMap.delete(entry.target);
            }
          }
        }

        if (this.pendingPieces.length > 0) {
          this.scheduleBatch();
        }
      },
      { rootMargin: VIEWPORT_MARGIN },
    );
  }

  /** Observe a translation piece */
  observe(piece: TranslationPiece): void {
    if (piece.isTranslated) return;

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

    const batch = [...this.pendingPieces];
    this.pendingPieces = [];
    this.onVisible(batch);
  }
}
