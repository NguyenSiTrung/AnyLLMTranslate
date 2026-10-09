/**
 * FR-11: live-text churn freeze. Tickers, clocks and live scores rewrite their
 * text constantly; re-translating each change burns requests and shows stale
 * text. An element whose source changes more than CHURN_MAX_CHANGES times
 * within CHURN_WINDOW_MS is frozen for the session (per element, WeakMap-held).
 */

export const CHURN_MAX_CHANGES = 3;
export const CHURN_WINDOW_MS = 60_000;

export class ChurnGuard {
  private changes = new WeakMap<Element, number[]>();
  private frozen = new WeakSet<Element>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Record one source change of `el`; true when `el` is (now) frozen. */
  recordChange(el: Element): boolean {
    if (this.frozen.has(el)) return true;
    const t = this.now();
    const recent = (this.changes.get(el) ?? []).filter((at) => t - at < CHURN_WINDOW_MS);
    recent.push(t);
    if (recent.length > CHURN_MAX_CHANGES) {
      this.frozen.add(el);
      this.changes.delete(el);
      return true;
    }
    this.changes.set(el, recent);
    return false;
  }

  isFrozen(el: Element): boolean {
    return this.frozen.has(el);
  }

  /** Forget all history and freezes (Start/Stop). */
  reset(): void {
    this.changes = new WeakMap();
    this.frozen = new WeakSet();
  }
}
