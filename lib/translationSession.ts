/**
 * Thin translation session contract (FR-1, FR-3).
 *
 * Owns a monotonically increasing session id plus a registry of live
 * ports/AbortControllers so stop/restart/body-swap can drop in-flight work
 * and prevent stale DOM writes (especially streaming piece events).
 */

export interface Disconnectable {
  disconnect: () => void;
}

export interface Abortable {
  abort: (reason?: unknown) => void;
}

/** True when a captured request session still matches the live session. */
export function isSessionCurrent(requestSession: number, currentSession: number): boolean {
  return requestSession === currentSession;
}

/**
 * Session id + abort/disconnect registry.
 * Content script holds one instance for the page lifecycle.
 */
export class TranslationSessionRegistry {
  private _session = 0;
  private readonly ports = new Map<number, Set<Disconnectable>>();
  private readonly aborts = new Map<number, Set<Abortable>>();

  get current(): number {
    return this._session;
  }

  /** Bump session and abort/disconnect resources from the previous id. */
  bump(): number {
    const previous = this._session;
    this._session += 1;
    this.abortSession(previous);
    return this._session;
  }

  isCurrent(requestSession: number): boolean {
    return isSessionCurrent(requestSession, this._session);
  }

  registerPort(session: number, port: Disconnectable): void {
    let set = this.ports.get(session);
    if (!set) {
      set = new Set();
      this.ports.set(session, set);
    }
    set.add(port);
  }

  unregisterPort(session: number, port: Disconnectable): void {
    const set = this.ports.get(session);
    if (!set) return;
    set.delete(port);
    if (set.size === 0) this.ports.delete(session);
  }

  registerAbort(session: number, controller: Abortable): void {
    let set = this.aborts.get(session);
    if (!set) {
      set = new Set();
      this.aborts.set(session, set);
    }
    set.add(controller);
  }

  unregisterAbort(session: number, controller: Abortable): void {
    const set = this.aborts.get(session);
    if (!set) return;
    set.delete(controller);
    if (set.size === 0) this.aborts.delete(session);
  }

  /** Disconnect ports and abort controllers for a session id. */
  abortSession(session: number): void {
    const portSet = this.ports.get(session);
    if (portSet) {
      for (const port of portSet) {
        try {
          port.disconnect();
        } catch {
          /* best-effort */
        }
      }
      this.ports.delete(session);
    }
    const abortSet = this.aborts.get(session);
    if (abortSet) {
      for (const controller of abortSet) {
        try {
          controller.abort();
        } catch {
          /* best-effort */
        }
      }
      this.aborts.delete(session);
    }
  }

  /** Abort every registered session (used on full teardown). */
  abortAll(): void {
    const sessions = new Set<number>([...this.ports.keys(), ...this.aborts.keys()]);
    for (const session of sessions) {
      this.abortSession(session);
    }
  }
}

/**
 * Serializes async lifecycle transitions (start / stop / body-swap).
 * Concurrent callers chain onto the same promise queue.
 */
export class LifecycleMutex {
  private tail: Promise<void> = Promise.resolve();

  /**
   * Run `fn` after any in-flight lifecycle work settles.
   * Errors from `fn` reject the returned promise but do not break the queue.
   */
  run<T>(fn: () => Promise<T> | T): Promise<T> {
    const run = this.tail.then(() => fn());
    // Keep the chain alive even when fn rejects.
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
