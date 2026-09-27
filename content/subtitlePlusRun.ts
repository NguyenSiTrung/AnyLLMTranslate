/**
 * Plus run controller — pure state machine for one whole-track Plus run.
 *
 * Owns no timers, no DOM, and no chrome APIs: the coordinator supplies effects
 * and drives the stall check. That keeps the interesting behaviour (session
 * filtering, terminal handling, stop, stall detection) unit-testable without a
 * browser harness.
 *
 * See docs/superpowers/specs/2026-09-27-subtitle-plus-mode-design.md.
 */

import type { SubtitleCue } from '@/types/subtitle';
import type { SubtitlePlusCompleteMessage, SubtitlePlusProgressMessage } from '@/types/messages';

/** No progress push for this long means the run is dead (service worker
 *  recycled, tab suspended, terminal message lost). */
export const PLUS_STALL_TIMEOUT_MS = 45_000;

export interface PlusRunEffects {
  /** Ask the background to cancel the run. */
  cancel: () => void;
  /** Update the progress chrome (completed, total). */
  progress: (completedChunks: number, totalChunks: number) => void;
  /** Publish the prepared cues. */
  commit: (cues: SubtitleCue[], partial: boolean) => void;
  /** Give up and keep the original captions. */
  fail: (reason: 'failed' | 'timeout' | 'cancelled') => void;
}

export type PlusRunState = 'idle' | 'running' | 'settled';

export class SubtitlePlusRun {
  private sessionId: number | null = null;
  private lastActivityAt = 0;
  private _state: PlusRunState = 'idle';

  constructor(
    private readonly effects: PlusRunEffects,
    private readonly stallTimeoutMs: number = PLUS_STALL_TIMEOUT_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get state(): PlusRunState {
    return this._state;
  }

  /** Begin a run from the background's ack. */
  start(sessionId: number, totalChunks: number): void {
    this.sessionId = sessionId;
    this.lastActivityAt = this.now();
    this._state = 'running';
    this.effects.progress(0, totalChunks);
  }

  handleProgress(message: SubtitlePlusProgressMessage): void {
    if (this._state !== 'running' || message.sessionId !== this.sessionId) return;
    this.lastActivityAt = this.now();
    this.effects.progress(message.completedChunks, message.totalChunks);
  }

  handleComplete(message: SubtitlePlusCompleteMessage): void {
    if (this._state !== 'running' || message.sessionId !== this.sessionId) return;
    this._state = 'settled';
    if (message.outcome === 'failed') {
      this.effects.fail('failed');
      return;
    }
    this.effects.commit(message.cues, message.partial);
  }

  /** The user pressed Stop. */
  stop(): void {
    if (this._state !== 'running') return;
    this._state = 'settled';
    this.effects.cancel();
    this.effects.fail('cancelled');
  }

  isStalled(): boolean {
    return this._state === 'running' && this.now() - this.lastActivityAt > this.stallTimeoutMs;
  }

  /** Called by the coordinator when isStalled() is true. Idempotent. */
  failByStall(): void {
    if (!this.isStalled()) return;
    this._state = 'settled';
    this.effects.cancel();
    this.effects.fail('timeout');
  }
}
