/**
 * IME-safe gesture detection for trailing trigger keys (e.g. triple-space).
 */

export interface GestureConfig {
  enabled: boolean;
  triggerKey: string;
  tapCount: number;
  timeWindowMs: number;
  idleMs: number;
  triggerGapMs: number;
  triggerToleranceCount: number;
}

export interface GestureCallbacks {
  /** Called when gesture fires (after optional idle debounce) */
  onTrigger: (target: HTMLElement) => void;
  /** Guard: is this element allowed? */
  shouldAccept: (el: Element | null) => el is HTMLElement;
  /** Optional: caret-at-end check for trailing gesture */
  isCaretAtEnd?: (el: HTMLElement) => boolean;
  /** Optional: get field text to skip empty */
  getText?: (el: HTMLElement) => string;
  now?: () => number;
}

export interface GestureController {
  /** Handle a KeyboardEvent (keydown preferred for counting) */
  onKeyDown: (event: KeyboardEvent) => void;
  /** Handle compositionend / input for IME reset & dual path */
  onCompositionEnd: (event: Event) => void;
  onCompositionStart: (event: Event) => void;
  onInput: (event: Event) => void;
  /** Reset counters */
  reset: () => void;
  /** Update config */
  setConfig: (partial: Partial<GestureConfig>) => void;
  getConfig: () => GestureConfig;
  /** Test: current tap timestamps */
  getTimestamps: () => number[];
  dispose: () => void;
}

/**
 * Create a gesture controller. Callers attach listeners and call the handlers.
 */
export function createGestureController(
  initial: GestureConfig,
  callbacks: GestureCallbacks,
): GestureController {
  let config: GestureConfig = { ...initial };
  let keyTimestamps: number[] = [];
  let composing = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingTarget: HTMLElement | null = null;
  const processedEvents = new WeakSet<Event>();

  const now = () => (callbacks.now ? callbacks.now() : Date.now());

  function clearIdle(): void {
    if (idleTimer != null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    pendingTarget = null;
  }

  function reset(): void {
    keyTimestamps = [];
    clearIdle();
  }

  function fire(target: HTMLElement): void {
    clearIdle();
    keyTimestamps = [];
    callbacks.onTrigger(target);
  }

  function scheduleFire(target: HTMLElement): void {
    clearIdle();
    pendingTarget = target;
    const idle = config.idleMs > 0 ? config.idleMs : 0;
    if (idle <= 0) {
      // microtask so the last character lands in the field
      setTimeout(() => {
        if (pendingTarget === target) fire(target);
      }, 0);
      return;
    }
    idleTimer = setTimeout(() => {
      if (pendingTarget === target) fire(target);
    }, idle);
  }

  function acceptTap(target: HTMLElement): void {
    const t = now();

    // Gap filter: if triggerGapMs > 0, taps closer than gap still count
    // but we only prune by time window
    keyTimestamps.push(t);
    keyTimestamps = keyTimestamps.filter((ts) => t - ts <= config.timeWindowMs);

    // Tolerance: if we somehow have way more taps, trim to window
    if (
      config.triggerToleranceCount > 0 &&
      keyTimestamps.length > config.tapCount + config.triggerToleranceCount
    ) {
      keyTimestamps = keyTimestamps.slice(-config.tapCount);
    }

    if (keyTimestamps.length >= config.tapCount) {
      scheduleFire(target);
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (processedEvents.has(event)) return;
    processedEvents.add(event);

    if (!config.enabled) return;

    // P0: ignore untrusted, composing, and key-repeat.
    // jsdom/Vitest KeyboardEvents are never trusted — allow them only under test.
    const isTestEnv =
      (typeof process !== 'undefined' && process.env?.VITEST === 'true') ||
      (typeof import.meta !== 'undefined' &&
        Boolean((import.meta as ImportMeta & { env?: { VITEST?: boolean } }).env?.VITEST));
    if (!event.isTrusted && !isTestEnv) return;
    if (event.isComposing || composing) {
      reset();
      return;
    }
    if (event.repeat) return;

    if (event.key !== config.triggerKey) {
      // Non-trigger key resets gesture (user continued typing)
      keyTimestamps = [];
      clearIdle();
      return;
    }

    const target = event.target as Element | null;
    if (!callbacks.shouldAccept(target)) {
      reset();
      return;
    }

    if (callbacks.isCaretAtEnd && !callbacks.isCaretAtEnd(target)) {
      // Mid-string space — do not count toward trailing gesture
      reset();
      return;
    }

    if (callbacks.getText) {
      const text = callbacks.getText(target);
      // Allow counting when only trigger chars exist if user is about to fire
      // but skip truly empty before any trigger landed
      if (!text.trim() && keyTimestamps.length === 0) {
        // First space on empty field — ignore
        return;
      }
    }

    acceptTap(target);
  }

  function onCompositionStart(_event: Event): void {
    composing = true;
    reset();
  }

  function onCompositionEnd(_event: Event): void {
    composing = false;
    reset();
  }

  function onInput(event: Event): void {
    if (processedEvents.has(event)) return;
    // Delete-like inputTypes reset gesture progress
    const ie = event as InputEvent;
    const inputType = ie.inputType ?? '';
    if (
      inputType.startsWith('delete') ||
      inputType === 'historyUndo' ||
      inputType === 'historyRedo'
    ) {
      reset();
    }
  }

  return {
    onKeyDown,
    onCompositionEnd,
    onCompositionStart,
    onInput,
    reset,
    setConfig(partial) {
      config = { ...config, ...partial };
      reset();
    },
    getConfig: () => ({ ...config }),
    getTimestamps: () => [...keyTimestamps],
    dispose() {
      reset();
    },
  };
}
